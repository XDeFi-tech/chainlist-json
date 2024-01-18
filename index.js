const axios = require("axios");
const https = require("https");
const fs = require("fs");

async function getRpcLatency(url) {
  const start = Date.now();
  try {
    await axios.post(url, {
      timeout: 3000, // 3 seconds timeout
      httpsAgent: new https.Agent({ keepAlive: true }),
    });
    const latency = Date.now() - start;
    return { url, latency };
  } catch (error) {
    // console.error({ error });
    return { url, latency: Infinity };
  }
}

async function processBatch(rpcs) {
  const results = [];
  for (const rpc of rpcs) {
    const result = await getRpcLatency(rpc);
    results.push(result);
  }
  const filtered = results.filter((result) => result.latency !== Infinity);
  const sorted = filtered.sort((a, b) => a.latency - b.latency);
  return sorted.map((result) => result.url);
}

async function sortAndFilterRpcs(rpcs) {
  const batchSize = 5;
  const batches = [];

  for (let i = 0; i < rpcs.length; i += batchSize) {
    batches.push(rpcs.slice(i, i + batchSize));
  }

  const sortedRpcs = [];
  for (const batch of batches) {
    const sortedBatch = await processBatch(batch);
    sortedRpcs.push(...sortedBatch);
  }

  return sortedRpcs;
}

async function processRpcs() {
  try {
    const response = await axios.get(
      "https://raw.githubusercontent.com/DefiLlama/chainlist/main/constants/extraRpcs.js"
    );

    const regex = /export const extraRpcs = ({[\s\S]*?});\s*$/gm;
    const matches = regex.exec(response.data);

    const extractedRpcsString = matches[0];
    const cleanedString = extractedRpcsString
      .replace("export const extraRpcs = ", "")
      .replace(/^[ \t]*.*tracking.*\n/gm, "")
      .replaceAll("${INFURA_API_KEY}", "");

    let rpcObject = {};
    eval(`rpcObject = ${cleanedString}`);

    const finalSortedRpcs = {};
    const networkIds = Object.keys(rpcObject);
    for (let i = 0; i < networkIds.length; i++) {
      const networkId = networkIds[i];
      const rpcs = rpcObject[networkId].rpcs.map((rpc) =>
        typeof rpc === "object" ? rpc.url : rpc
      );
      console.log("Processing RPCs for network:", networkId);
      const sortedRpcList = await sortAndFilterRpcs(rpcs);
      // console.log({ sortedRpcList, rpcs });
      finalSortedRpcs[networkId] = sortedRpcList;
    }

    try {
      // overrides rpc
      const overrides = fs.readFileSync("overrides.json", "utf8");
      const overridesObject = JSON.parse(overrides);
      const networkIdsOverrides = Object.keys(overridesObject);
      for (let i = 0; i < networkIdsOverrides.length; i++) {
        const networkId = networkIdsOverrides[i];
        const rpcs = overridesObject[networkId];
        console.log("Processing RPCs for network:", networkId);
        finalSortedRpcs[networkId] = [
          ...rpcs,
          ...(finalSortedRpcs[networkId] || []),
        ];
      }
    } catch (error) {
      console.error("Failed to load overrides.json file");
    }

    const jsonString = JSON.stringify(finalSortedRpcs, null, 2);
    fs.writeFile("export.json", jsonString, "utf8", (error) => {
      if (error) {
        console.error("Failed to write file:", error);
      } else {
        console.log("Data written to export.json");
      }
    });
  } catch (error) {
    console.error(error);
    throw new Error("Failed to process RPCs");
  }
}

// Call the function to start processing
processRpcs();
