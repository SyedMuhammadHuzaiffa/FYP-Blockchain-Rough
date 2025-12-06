
# Day 1 — Remix + Ganache (Local)

This is a **ready-to-go folder** for Day 1. Follow the steps, then capture the deliverables.

---

## A. Prep (10–15 min)

1) **Ganache Desktop** → Quickstart  
   - RPC: `http://127.0.0.1:7545`  
   - You should see **10 funded accounts**.

2) **MetaMask**  
   - Add a new network:  
     - Network name: `Ganache`  
     - RPC URL: `http://127.0.0.1:7545`  
     - Chain ID: `1337` or `5777` (use what Ganache shows)  
     - Currency symbol: `ETH`  
   - In Ganache, click any account → copy **private key** → **Import account** into MetaMask.

---

## B. Contract coding in Remix (20–30 min)

1) Open **https://remix.ethereum.org**  
2) In File Explorer, create `contracts/Certificate.sol` and paste from `./contracts/Certificate.sol` in this folder.  
3) Open **Solidity compiler**:  
   - Compiler: **0.8.24**  
   - Click **Compile Certificate.sol**

---

## C. Local deployment to Ganache (10–15 min)

1) Open **Deploy & Run** in Remix:  
   - Environment: **Injected Provider – MetaMask**  
   - Ensure MetaMask is on **Ganache**.  
2) Select **Contract = Certificate** → **Deploy** → approve in MetaMask.  
3) Copy the **deployed address** from Remix console.

> Write it here for later:
```
LOCAL_DEPLOYED_ADDRESS=0x________________________________________
```

---

## D. Quick manual test (5–10 min)

1) In **Deployed Contracts** panel, expand the instance.  
2) Call:
```
addCertificate("Alice","Blockchain 101","QmTestCid123")
```
Approve when prompted.  
3) Call:
```
verifyCertificate("QmTestCid123")
```
Expected tuple:
```
["Alice","Blockchain 101","QmTestCid123", <timestamp>, true]
```

Take a screenshot of the successful return.

---

## E. Export ABI for frontend (5 min)

1) In **Compile** tab → click **ABI** → copies JSON to clipboard.  
2) Paste into `./frontend/abi.json` (replace the placeholder).

---

## F. Day 1 Deliverables (put them in this folder)

- ✅ Deployed **local** address (Ganache) — add it to `LOCAL.txt`
- ✅ `frontend/abi.json` (actual ABI JSON pasted)
- ✅ Screenshot of successful `verifyCertificate` call
- ✅ Short `README_LOCAL.md` with:
  - Network = Ganache (RPC + chainId)
  - Deployed address
  - Contract name = `Certificate`
  - Functions: `addCertificate`, `verifyCertificate` (params/returns)

---

## G. Common pitfalls (and fixes)

- **Wrong network in MetaMask** → switch to **Ganache** before deploying.  
- **“Already exists” error** → you used same IPFS hash; change the CID string.  
- **Ganache shows no tx** → you deployed to a different network; re-check RPC/chainId.

