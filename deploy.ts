import { config } from "dotenv";
config();

import {
    Cell,
    beginCell,
    contractAddress,
    storeStateInit,
    toNano,
    Address,
    StateInit,
} from "ton-core";
import { mnemonicToPrivateKey } from "ton-crypto";
import qs from "qs";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
});

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

async function deployContract() {
    // 1. Load mnemonic from env
    const mnemonicEnv = process.env.MNEMONIC;
    if (!mnemonicEnv) {
        throw new Error("MNEMONIC is not set in .env file");
    }
    const mnemonic = mnemonicEnv.split(" ");

    // 2. Derive private key and public key
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const publicKey = keyPair.publicKey;

    // 3. Load compiled collection contract code cell
    const collectionPath = path.resolve("./build/nft-collection.compiled.json");
    if (!fs.existsSync(collectionPath)) {
        throw new Error("Compiled nft-collection contract not found. Run build.ts first.");
    }
    const collectionJson = JSON.parse(fs.readFileSync(collectionPath, "utf8"));
    const collectionCodeCell = Cell.fromBoc(Buffer.from(collectionJson.hex, "hex"))[0];

    // 4. Load compiled nft-item contract code cell
    const nftItemPath = path.resolve("./build/nft-item.compiled.json");
    if (!fs.existsSync(nftItemPath)) {
        throw new Error("Compiled nft-item contract not found. Run build.ts first.");
    }
    const nftItemJson = JSON.parse(fs.readFileSync(nftItemPath, "utf8"));
    const nftItemCodeCell = Cell.fromBoc(Buffer.from(nftItemJson.hex, "hex"))[0];

    // 5. Create metadata content cell using snake format
    const metadataJson = JSON.stringify({
        name: "Evobots",
        description: "Collection of unique Evobot NFTs",
        image: "ipfs://bafkreie3stiumupbsmcn2pzhzupcad2igkklpkheed5dwayq4yxcwmzf4y",
        external_url: "https://evobots.ton",
        social_links: [],
        marketplace: "tonkeeper"
    });
    const contentCell = makeSnakeCell(metadataJson);

    // 6. Empty royalty params cell (customize if needed)
    const royaltyParamsCell = beginCell().endCell();

    // 7. Compose initial data cell for collection contract storage
    const ownerAddress = Address.parse(`0:${publicKey.toString('hex')}`);

    const dataCell = beginCell()
        .storeAddress(ownerAddress)
        .storeUint(0, 64) // next_item_index = 0
        .storeRef(contentCell)
        .storeRef(nftItemCodeCell) // embed nft-item code here
        .storeRef(royaltyParamsCell)
        .endCell();

    // 8. Build StateInit structure
    const stateInit: StateInit = {
        code: collectionCodeCell,
        data: dataCell,
    };

    // 9. Compute collection contract address
    const address = contractAddress(0, stateInit);

    console.log("➡️ Contract will be deployed to:", address.toString());

    // 10. Build deploy message cell for TON Keeper
    const stateInitBuilder = beginCell();
    storeStateInit(stateInit)(stateInitBuilder);
    const stateInitCell = stateInitBuilder.endCell();

    // 11. Generate TON Keeper deploy link
    const deployLink =
        "https://app.tonkeeper.com/transfer/" +
        address.toString({ testOnly: true }) +
        "?" +
        qs.stringify({
            text: "Evobot NFT Collection deploy",
            amount: toNano("1").toString(10), // Increased initial balance for collection
            init: stateInitCell.toBoc({ idx: false }).toString("base64"),
        });

    console.log("TON Keeper deploy link:\n", deployLink);

    // 12. Show QR code in terminal
    qrcode.generate(deployLink, { small: true }, (qr) => {
        console.log(qr);
    });

    // 13. Show TON testnet scan link for monitoring
    console.log(
        "View deployment progress at:\n",
        `https://testnet.tonscan.org/address/${address.toString({
            testOnly: true,
        })}`
    );
}

deployContract().catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
});
