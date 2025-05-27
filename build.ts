import {
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
} from "node:fs";
import path from "path";
import process from "process";
import { Cell } from "ton-core";
import { compileFunc } from "@ton-community/func-js";

function collectFcFiles(
    dir: string,
    baseDir: string,
    sourceMap: Record<string, string>
) {
    for (const name of readdirSync(dir)) {
        const fullPath = path.join(dir, name);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
            collectFcFiles(fullPath, baseDir, sourceMap);
        } else if (name.endsWith(".fc")) {
            const rel = path.relative(baseDir, fullPath).replace(/\\/g, "/");
            sourceMap[rel] = readFileSync(fullPath, "utf8");
        }
    }
}

async function compileScript() {
    // Ensure build/ exists
    const buildDir = path.resolve("build");
    if (!existsSync(buildDir)) mkdirSync(buildDir);

    // Collect all .fc files under contracts/
    const contractsDir = path.resolve("contracts");
    const sourceMap: Record<string, string> = {};
    collectFcFiles(contractsDir, contractsDir, sourceMap);

    // List of contract entry points to compile
    const entryPoints = [
        "nft-collection.fc",
        "nft-item.fc",
        // Add other contracts here if needed
    ];

    for (const entryRel of entryPoints) {
        const entryAbs = path.join(contractsDir, entryRel);

        console.log(`🛠️ Compiling ${entryRel}...`);

        const compileResult = await compileFunc({
            targets: [entryAbs],
            sources: (srcPath) => {
                let rel = path.isAbsolute(srcPath)
                    ? path.relative(contractsDir, srcPath)
                    : srcPath;
                rel = rel.replace(/\\/g, "/");
                if (!sourceMap[rel]) {
                    console.error("Missing source for:", rel);
                    process.exit(1);
                }
                return sourceMap[rel];
            },
        });

        if (compileResult.status === "error") {
            console.error(`❌ Compilation failed for ${entryRel}:`, compileResult.message);
            process.exit(1);
        }

        // Output file named after contract
        const outputFilename = path.basename(entryRel, ".fc") + ".compiled.json";
        const outPath = path.join(buildDir, outputFilename);

        writeFileSync(
            outPath,
            JSON.stringify({
                hex: Cell.fromBoc(Buffer.from(compileResult.codeBoc, "base64"))[0]
                    .toBoc()
                    .toString("hex"),
            })
        );

        console.log(`✅ Compiled successfully to: ${outPath}`);
    }
}

compileScript().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
