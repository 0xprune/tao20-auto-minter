#!/usr/bin/env node

import dotenv from 'dotenv';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import process from 'node:process';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { hexToU8a, isHex } from '@polkadot/util';

dotenv.config();

const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (
    message.includes('API/INIT: RPC methods not decorated') ||
    message.includes('Unknown signed extensions')
  ) {
    return;
  }

  originalConsoleWarn(...args);
};

const TAO_DECIMALS = 9n;
const DEFAULT_RPC_URL = process.env.TAO_RPC_URL || 'wss://entrypoint-finney.opentensor.ai:443';
const DEFAULT_TREASURY =
  process.env.TAO_TREASURY || '5Fh7dSmMKVXT5YC7hsfCcHDg171xtQWBhppu66pxCqbvnnJC';
const DEFAULT_MINT_FEE = process.env.TAO_MINT_FEE || '0.001';
const DEFAULT_DELAY_MS = Number.parseInt(process.env.TAO_DEFAULT_DELAY_MS || '1200', 10);
const DEFAULT_CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_SEND_MODE = (process.env.TAO_SEND_MODE || 'fast').toLowerCase();
const BITTENSOR_SIGNED_EXTENSIONS = {
  SudoTransactionExtension: { extrinsic: {}, payload: {} },
  CheckShieldedTxValidity: { extrinsic: {}, payload: {} },
  SubtensorTransactionExtension: { extrinsic: {}, payload: {} },
  DrandPriority: { extrinsic: {}, payload: {} },
  CheckMetadataHash: {
    extrinsic: { mode: 'u8' },
    payload: { hash: 'Option<[u8; 32]>' }
  }
};
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

const BANNER_LINES = [
  '████████╗ █████╗  ██████╗ ███████╗ ██████╗██████╗ ██╗██████╗ ████████╗██╗ ██████╗ ███╗   ██╗███████╗',
  '╚══██╔══╝██╔══██╗██╔═══██╗██╔════╝██╔════╝██╔══██╗██║██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║██╔════╝',
  '   ██║   ███████║██║   ██║███████╗██║     ██████╔╝██║██████╔╝   ██║   ██║██║   ██║██╔██╗ ██║███████╗',
  '   ██║   ██╔══██║██║   ██║╚════██║██║     ██╔══██╗██║██╔═══╝    ██║   ██║██║   ██║██║╚██╗██║╚════██║',
  '   ██║   ██║  ██║╚██████╔╝███████║╚██████╗██║  ██║██║██║        ██║   ██║╚██████╔╝██║ ╚████║███████║',
  '   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝'
];

function colorize(value, color) {
  return `${color}${value}${ANSI.reset}`;
}

function line(char = '─', width = 96) {
  return colorize(char.repeat(width), ANSI.gray);
}

function centerText(text, width = 96) {
  const clean = String(text);
  const left = Math.max(0, Math.floor((width - clean.length) / 2));
  return `${' '.repeat(left)}${clean}`;
}

function renderBanner() {
  const title = BANNER_LINES.map((entry) => colorize(entry, ANSI.cyan)).join('\n');
  const subtitle = colorize(centerText('AUTO MINTER'), ANSI.bold + ANSI.white);
  const author = colorize(centerText('created by Prune'), ANSI.dim + ANSI.green);
  return [line('═'), title, '', subtitle, author, line('═')].join('\n');
}

function label(text) {
  return colorize(text.padEnd(10), ANSI.gray);
}

function infoRow(name, value, tone = ANSI.white) {
  return `${label(name)} ${colorize(value, tone)}`;
}

function section(title) {
  return `\n${colorize(`> ${title}`, ANSI.bold + ANSI.cyan)}\n${line()}`;
}

function promptText(value) {
  return colorize(value, ANSI.bold + ANSI.cyan);
}

function statusTag(kind) {
  const lookup = {
    ok: colorize('✓', ANSI.bold + ANSI.green),
    info: colorize('•', ANSI.bold + ANSI.cyan),
    warn: colorize('!', ANSI.bold + ANSI.yellow),
    fail: colorize('✗', ANSI.bold + ANSI.red)
  };

  return lookup[kind] || lookup.info;
}

function parseTaoToRao(value) {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid TAO amount: ${value}`);
  }

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const paddedFraction = `${fractionalPart}000000000`.slice(0, Number(TAO_DECIMALS));

  return BigInt(wholePart) * 10n ** TAO_DECIMALS + BigInt(paddedFraction);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTaoFromRao(rao) {
  const value = BigInt(rao);
  const whole = value / 10n ** TAO_DECIMALS;
  const fraction = (value % 10n ** TAO_DECIMALS).toString().padStart(Number(TAO_DECIMALS), '0');
  return `${whole}.${fraction.replace(/0+$/, '') || '0'}`;
}

function normalizeTicker(raw) {
  return raw.trim().toUpperCase();
}

function validateTicker(ticker) {
  if (!/^[A-Z]{4}$/.test(ticker)) {
    throw new Error('Ticker must be exactly 4 uppercase letters, example: BYTE');
  }
}

function validateMintAmount(amount) {
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error('Mint amount must be a positive integer');
  }
}

function validateSendMode(mode) {
  const normalized = String(mode).trim().toLowerCase();
  if (normalized !== 'fast' && normalized !== 'finalized') {
    throw new Error('Mode must be either fast or finalized');
  }
}

async function askQuestion(rl, prompt, validator, fallback) {
  while (true) {
    const fullPrompt = fallback
      ? `${promptText(prompt)} ${colorize(`[default: ${fallback}]`, ANSI.dim + ANSI.gray)} `
      : `${promptText(prompt)} `;
    const answer = (await rl.question(fullPrompt)).trim();
    const value = answer || fallback;

    try {
      if (validator) {
        validator(value);
      }
      return value;
    } catch (error) {
      console.error(`\n${statusTag('warn')} ${colorize(error.message, ANSI.yellow)}\n`);
    }
  }
}

function loadKeypair(secret) {
  const keyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
  const trimmed = secret.trim();

  if (!trimmed) {
    throw new Error('TAO_SECRET is empty');
  }

  if (trimmed.includes(' ')) {
    return keyring.addFromUri(trimmed);
  }

  if (trimmed.startsWith('//')) {
    return keyring.addFromUri(trimmed);
  }

  if (isHex(trimmed)) {
    const seed = hexToU8a(trimmed);
    if (seed.length === 32) {
      return keyring.addFromSeed(seed);
    }
    return keyring.addFromUri(trimmed);
  }

  return keyring.addFromUri(trimmed);
}

async function connectApi() {
  const provider = new WsProvider(DEFAULT_RPC_URL);

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `RPC connection timed out after ${DEFAULT_CONNECT_TIMEOUT_MS} ms: ${DEFAULT_RPC_URL}`
        )
      );
    }, DEFAULT_CONNECT_TIMEOUT_MS);
  });

  try {
    const api = await Promise.race([
      ApiPromise.create({
        provider,
        signedExtensions: BITTENSOR_SIGNED_EXTENSIONS
      }),
      timeout
    ]);
    await Promise.race([api.isReady, timeout]);
    return { api, provider };
  } catch (error) {
    provider.disconnect();
    throw error;
  }
}

async function getAvailableBalance(api, address) {
  const account = await api.query.system.account(address);
  return account.data.free.toBigInt();
}

async function signAndSendOnce(api, signer, payload, feeRao, sendMode, nonce) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    let completed = false;

    const tx = api.tx.utility.batchAll([
      api.tx.balances.transferKeepAlive(DEFAULT_TREASURY, feeRao),
      api.tx.system.remark(payload)
    ]);

    const finish = (handler) => {
      if (completed) {
        return;
      }

      completed = true;
      unsubscribe();
      handler();
    };

    tx.signAndSend(signer, { nonce }, ({ status, dispatchError, txHash, events }) => {
      if (dispatchError) {
        let message = dispatchError.toString();
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          message = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
        }

        finish(() => reject(new Error(message)));
        return;
      }

      if (status.isBroadcast) {
        console.log(`${statusTag('info')} broadcast ${colorize(txHash.toHex(), ANSI.cyan)}`);
      }

      if (status.isInBlock) {
        console.log(`${statusTag('info')} in block  ${colorize(status.asInBlock.toHex(), ANSI.cyan)}`);
        if (sendMode === 'fast') {
          finish(() =>
            resolve({
              txHash: txHash.toHex(),
              stage: 'inBlock',
              blockHash: status.asInBlock.toHex()
            })
          );
          return;
        }
      }

      if (status.isFinalized) {
        const failed = events.find(({ event }) => api.events.system.ExtrinsicFailed.is(event));
        if (failed) {
          const [error] = failed.event.data;
          let message = error.toString();
          if (error.isModule) {
            const decoded = api.registry.findMetaError(error.asModule);
            message = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
          }

          finish(() => reject(new Error(message)));
          return;
        }

        finish(() =>
          resolve({
            txHash: txHash.toHex(),
            stage: 'finalized',
            finalizedBlockHash: status.asFinalized.toHex()
          })
        );
      }
    })
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch(reject);
  });
}

async function main() {
  await cryptoWaitReady();

  const secret = process.env.TAO_SECRET || process.env.SEED_PHRASE;
  if (!secret) {
    throw new Error('Missing TAO_SECRET or SEED_PHRASE in .env');
  }

  const rl = readline.createInterface({ input, output });

  try {
    const signer = loadKeypair(secret);
    console.log(`\n${renderBanner()}`);
    console.log(section('🔧 Session'));
    console.log(infoRow('wallet', signer.address, ANSI.green));
    console.log(infoRow('rpc', DEFAULT_RPC_URL, ANSI.white));
    console.log(infoRow('treasury', DEFAULT_TREASURY, ANSI.white));
    console.log(infoRow('fee/tx', `${DEFAULT_MINT_FEE} TAO`, ANSI.yellow));

    const ticker = normalizeTicker(
      await askQuestion(rl, '🎯 Ticker yang mau di-mint', validateTicker)
    );
    const mintAmount = await askQuestion(rl, '💎 Amount per mint', validateMintAmount);
    const iterations = Number.parseInt(
      await askQuestion(rl, '🔁 Berapa kali iterasi mint', (value) => {
        if (!/^\d+$/.test(value) || Number.parseInt(value, 10) <= 0) {
          throw new Error('Iterations must be a positive integer');
        }
      }),
      10
    );
    const delayMs = Number.parseInt(
      await askQuestion(
        rl,
        '⏱ Delay antar transaksi dalam ms',
        (value) => {
          if (!/^\d+$/.test(value)) {
            throw new Error('Delay must be a non-negative integer');
          }
        },
        String(DEFAULT_DELAY_MS)
      ),
      10
    );
    const sendMode = (
      await askQuestion(
        rl,
        '⚡ Mode kirim (fast/finalized)',
        validateSendMode,
        DEFAULT_SEND_MODE
      )
    ).toLowerCase();

    const payload = JSON.stringify({
      p: 'tao-20',
      op: 'mint',
      tick: ticker,
      amt: mintAmount
    });

    const totalMintFeeRao = parseTaoToRao(DEFAULT_MINT_FEE) * BigInt(iterations);
    const { api, provider } = await connectApi();

    try {
      const freeBalance = await getAvailableBalance(api, signer.address);
      console.log(section('📝 Mint Plan'));
      console.log(infoRow('ticker', ticker, ANSI.green));
      console.log(infoRow('amount', mintAmount, ANSI.green));
      console.log(infoRow('tx count', String(iterations), ANSI.green));
      console.log(infoRow('delay', `${delayMs} ms`, ANSI.white));
      console.log(infoRow('mode', sendMode, sendMode === 'fast' ? ANSI.yellow : ANSI.white));
      console.log(infoRow('balance', `${formatTaoFromRao(freeBalance)} TAO`, ANSI.green));
      console.log(infoRow('mint fee', `${formatTaoFromRao(totalMintFeeRao)} TAO total`, ANSI.yellow));
      console.log(colorize('\n⛽ Gas network belum termasuk di estimasi fee mint.', ANSI.dim + ANSI.gray));
      console.log(colorize('\n🚀 Starting mint loop...\n', ANSI.bold + ANSI.cyan));

      const perTxFeeRao = parseTaoToRao(DEFAULT_MINT_FEE);
      let nextNonce = (await api.rpc.system.accountNextIndex(signer.address)).toBigInt();
      let successCount = 0;
      let failedCount = 0;

      for (let index = 0; index < iterations; index += 1) {
        const currentNonce = nextNonce;
        nextNonce += 1n;

        console.log(
          `\n${colorize(`[${index + 1}/${iterations}]`, ANSI.dim + ANSI.gray)} ${statusTag('info')} minting ${colorize(
            ticker,
            ANSI.green
          )} ${colorize(`x${mintAmount}`, ANSI.white)} ${colorize(`(nonce ${currentNonce})`, ANSI.dim + ANSI.gray)}`
        );

        try {
          const result = await signAndSendOnce(
            api,
            signer,
            payload,
            perTxFeeRao,
            sendMode,
            currentNonce
          );
          successCount += 1;
          const shortHash = `${result.txHash.slice(0, 12)}...${result.txHash.slice(-6)}`;
          if (result.stage === 'finalized') {
            console.log(`${statusTag('ok')} ${colorize(shortHash, ANSI.green)} finalized`);
          } else if (result.stage === 'inBlock') {
            const shortBlock = `${result.blockHash.slice(0, 12)}...${result.blockHash.slice(-6)}`;
            console.log(
              `${statusTag('ok')} ${colorize(shortHash, ANSI.green)} ${colorize('in block', ANSI.cyan)} ${colorize(
                shortBlock,
                ANSI.dim + ANSI.gray
              )}`
            );
          }
        } catch (error) {
          failedCount += 1;
          if (String(error.message).includes('1014: Priority is too low')) {
            nextNonce = (await api.rpc.system.accountNextIndex(signer.address)).toBigInt();
          }
          console.error(`${statusTag('fail')} ${colorize(error.message, ANSI.red)}`);
        }

        if (index < iterations - 1 && delayMs > 0) {
          console.log(`${statusTag('info')} wait ${colorize(`${delayMs} ms`, ANSI.dim + ANSI.gray)}`);
          await sleep(delayMs);
        }
      }

      console.log(section('📊 Summary'));
      console.log(infoRow('success', `✓ ${successCount}`, ANSI.green));
      console.log(infoRow('failed', `✗ ${failedCount}`, failedCount > 0 ? ANSI.red : ANSI.white));
      console.log(infoRow('mode', sendMode, sendMode === 'fast' ? ANSI.yellow : ANSI.white));
    } finally {
      await api.disconnect();
      provider.disconnect();
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\n${statusTag('fail')} ${colorize(error.message, ANSI.red)}`);
  process.exitCode = 1;
});
