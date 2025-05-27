import { config } from "dotenv";
config();

import {
    TonClient,
    WalletContractV4,
    OpenedContract,
    Address,
    beginCell,
    Cell,
    toNano,
    internal,
} from "ton";
import fs from "fs";
import path from "path";
import { mnemonicToPrivateKey } from "ton-crypto";

// 1. Load mnemonic from env
const mnemonicEnv = process.env.MNEMONIC;
if (!mnemonicEnv) {
    throw new Error("MNEMONIC is not set in .env file");
}
const MNEMONIC = mnemonicEnv.split(" ");

// Helper function to create snake format cells for large strings
function makeSnakeCell(data: string) {
    const bytes = Buffer.from(data);
    let cell = beginCell();
    
    for (let i = 0; i < bytes.length; i += 127) {
        const chunk = bytes.slice(i, i + 127);
        if (i + 127 < bytes.length) {
            const nextCell = makeSnakeCell(data.slice(i + 127));
            cell = beginCell().storeBuffer(chunk).storeRef(nextCell);
        } else {
            cell = beginCell().storeBuffer(chunk);
        }
    }
    
    return cell.endCell();
}

// Replace with your deployed collection contract address
const COLLECTION_ADDRESS = Address.parse("EQBDwpGgAv6znvPfEjfO6puaPieTzOXh9GvXZ795mIu3POaz");

// Get API key from environment variable
const TON_API_KEY = process.env.TON_API_KEY;
const TON_RPC_ENDPOINT = "https://testnet.toncenter.com/api/v2/jsonRPC";

async function mintNFT(itemIndex: number, metadataJson: string) {
    // 1. Generate wallet keys
    const keyPair = await mnemonicToPrivateKey(MNEMONIC);
    const publicKey = keyPair.publicKey;
    
    console.log("Public Key:", publicKey.toString('hex'));

    // 2. Connect to TON with API key
    const client = new TonClient({
        endpoint: TON_RPC_ENDPOINT,
        apiKey: TON_API_KEY,
    });

    // 3. Create wallet instance
    const wallet = WalletContractV4.create({ publicKey, workchain: 0 });
    console.log("Using wallet address:", wallet.address.toString());
    const walletContract = client.open(wallet);

    // 4. Encode NFT metadata into cell using snake format
    const metadataCell = makeSnakeCell(metadataJson);

    // 5. Build mint message body
    const messageBody = beginCell()
        .storeUint(1, 32) // op = 1 (deploy new NFT)
        .storeUint(itemIndex, 64) // unique NFT id
        .storeCoins(toNano("0.05")) // TON for NFT storage (minimum required)
        .storeRef(metadataCell)
        .endCell();

    // 6. Create external transfer message
    const seqno = await walletContract.getSeqno();
    const transfer = {
        seqno,
        secretKey: keyPair.secretKey,
        messages: [internal({
            to: COLLECTION_ADDRESS,
            value: toNano("0.08"), // Total transaction value
            bounce: false, // Set to false to avoid bounces
            body: messageBody
        })]
    };

    // 7. Send mint transaction
    console.log(`Minting NFT #${itemIndex}...`);
    await walletContract.sendTransfer(transfer);

    console.log("Mint transaction sent!");
    console.log("View your collection on TON Scan testnet:");
    console.log(`https://testnet.tonscan.org/address/${COLLECTION_ADDRESS.toString()}`);
}

// Example NFT metadata
const exampleNFTMetadata = JSON.stringify({
    name: "Evobot #0",
    description: "First Evobot NFT",
    image: "https://raw.githubusercontent.com/ton-blockchain/nft-examples/main/nft/assets/1.jpg",
    attributes: []
});

// Mint NFT #0 with example metadata
mintNFT(0, exampleNFTMetadata).catch(console.error);
