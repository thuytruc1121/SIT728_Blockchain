// app.js — Redesigned DApp UI logic (pure Web3 v1)
/* ------------------------------------------------------------------
   How contract info is loaded
   1) Truffle-style artifact at /build/contracts/FoodSupplyChain.json
      (preferred; contains ABI + networks + address).
   2) Fallback: fill FOOD_ABI and FOOD_ADDRESS below.
-------------------------------------------------------------------*/

const FOOD_ABI = null;         // <- paste ABI array if not using artifact
const FOOD_ADDRESS = null;     // <- paste deployed address if not using artifact

let web3, account, contract;

// ---------- UI helpers
const $ = (sel) => document.querySelector(sel);
const el = {
  netName: $("#netName"),
  chainId: $("#chainId"),
  account: $("#account"),
  alert: $("#alert"),
  list: $("#batchList"),
  emptyMsg: $("#emptyMsg"),
  btnConnect: $("#btnConnect"),
  formCreate: $("#formCreate"),
  tl: {
    id: $("#tlBatchId"),
    name: $("#tlBatchName"),
    origin: $("#tlOrigin"),
    holder: $("#tlHolder"),
    expiry: $("#tlExpiry"),
    cond: $("#tlCond"),
    last: $("#tlLast"),
    list: $("#timeline"),
    modal: "#timelineModal",
    to: document.querySelector("#tlTransferTo"),
    transferBtn: document.querySelector("#btnTransfer"),
    condSel: document.querySelector("#tlCondSel"),
    condBtn: document.querySelector("#btnUpdateCond"),
    transferCount: document.querySelector("#tlTransferCount"),
    holderStatusAlert: document.querySelector("#holderStatusAlert"),
    holderStatusIcon: document.querySelector("#holderStatusIcon"),
    holderStatusText: document.querySelector("#holderStatusText"),
    markSoldCard: document.querySelector("#markSoldCard"),
    markSoldBtn: document.querySelector("#btnMarkSold"),
  }
};

function showAlert(msg, variant = "info", timeout = 5000) {
  el.alert.className = `alert alert-${variant}`;
  el.alert.textContent = msg;
  el.alert.classList.remove("d-none");
  if (timeout) {
    setTimeout(() => el.alert.classList.add("d-none"), timeout);
  }
}

function fmtAddr(a) { if (!a) return "-"; return a.slice(0, 6) + "…" + a.slice(-4); }
function fmtTs(ts) {
  if (!ts) return "-";
  // ts in seconds -> local string
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  } catch { return String(ts); }
}
function fmtDateFromEpochSec(ts) {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  return d.toISOString().slice(0, 10);
}

// ---------- connection
async function connect() {
  if (!window.ethereum) { showAlert("MetaMask not found. Please install it.", "danger", 8000); return; }
  web3 = new Web3(window.ethereum);
  const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
  account = accs[0];
  const cid = await web3.eth.getChainId();
  const net = await web3.eth.net.getNetworkType();
  el.account.textContent = account || "-";
  el.chainId.textContent = cid;
  el.netName.textContent = net;
  await initContract();
  await loadBatches();
}

async function initContract() {
  // Try loading Truffle artifact
  let abi, address;
  try {
    const res = await fetch("/FoodSupplyChain.json");
    if (!res.ok) throw new Error("Artifact not found");
    const art = await res.json();
    abi = art.abi;
    const cid = await web3.eth.getChainId();
    const netInfo = art.networks[String(cid)];
    if (!netInfo || !netInfo.address) {
      throw new Error(`Contract not deployed on chainId ${cid}. Re-run migrations or switch network.`);
    }
    address = netInfo.address;
  } catch (e) {
    if (!FOOD_ABI || !FOOD_ADDRESS) {
      showAlert(`Could not load artifact and no fallback ABI/address set. ${e.message}`, "danger", 10000);
      throw e;
    }
    abi = FOOD_ABI;
    address = FOOD_ADDRESS;
  }

  contract = new web3.eth.Contract(abi, address);

  // Auto-refresh when events come in (non-critical if provider doesn't support subscriptions)
  try {
    contract.events.allEvents().on("data", () => loadBatches()).on("error", console.error);
  } catch { }
}

// ---------- chain helpers
async function callWithRevertReason(method, from) {
  try {
    await method.call({ from }); // simulate
  } catch (e) {
    const msg = parseRpcError(e);
    throw new Error(msg || "Simulation failed");
  }
}

function parseRpcError(err) {
  try {
    const d = err?.data || err?.error?.data;
    const m = err?.message || err?.error?.message;
    const nested = d?.message || d?.reason ||
      (typeof d === "object" ? Object.values(d)[0]?.reason || Object.values(d)[0]?.message : null);
    return nested || m || String(err);
  } catch { return String(err); }
}
// ---------- write helpers with method-name fallbacks
// put near your other helpers
function findMethod(names) {
  if (!contract?.methods) return null;
  for (const n of names) {
    if (typeof contract.methods[n] === "function") return n;
  }
  return null;
}

async function doTransfer(batchId, to) {
  const name = findMethod(["advanceStage", "transferBatch", "transfer", "changeHolder", "setHolder"]);
  if (!name) throw new Error("No transfer method found in contract (expected advanceStage/transferBatch/transfer/changeHolder/setHolder).");
  const m = contract.methods[name](batchId, to);
  await callWithRevertReason(m, account);
  return await m.send({ from: account });
}

async function doUpdateCondition(batchId, ok) {
  const name = findMethod(["updateCondition", "setCondition", "markCondition"]);
  if (!name) throw new Error("No condition-update method found (expected updateCondition/setCondition/markCondition).");
  const m = contract.methods[name](batchId, ok);
  await callWithRevertReason(m, account);
  return await m.send({ from: account });
}

async function doMarkAsSold(batchId) {
  const m = contract.methods.markAsSold(batchId);
  await callWithRevertReason(m, account);
  return await m.send({ from: account });
}

async function isWarehouse(address) {
  try {
    return await contract.methods.warehouses(address).call();
  } catch {
    return false;
  }
}

async function isStore(address) {
  try {
    return await contract.methods.stores(address).call();
  } catch {
    return false;
  }
}

// Helper function to check if current account is the specific store
function isSpecificStore(account, storeAddress) {
  return account && account.toLowerCase() === storeAddress.toLowerCase();
}

// ---------- rendering
function clearTable() { el.list.innerHTML = ""; }

function addRow(batch) {
  // batch: { id,name,origin,holder,lastUpdate, expiry, conditionOk, stage }
  const tr = document.createElement("tr");
  tr.className = "clickable batch-row";
  tr.dataset.id = batch.id;

  // Determine row color based on status
  const isOwned = account && batch.holder && account.toLowerCase() === batch.holder.toLowerCase();
  const isBad = !batch.conditionOk;
  const isSold = batch.stage === 4; // Stage.Sold

  if (isBad) {
    tr.classList.add("batch-row-bad");
  } else if (isSold) {
    tr.classList.add("batch-row-sold");
  } else if (isOwned) {
    tr.classList.add("batch-row-owned");
  } else {
    tr.classList.add("batch-row-transferring");
  }

  // Format stage name
  const stageNames = ["Created", "Transported", "Warehoused", "Store", "Sold"];
  const stageName = stageNames[batch.stage] || "Unknown";
  const stageClass = `stage-${stageName.toLowerCase()}`;

  // Display batch size (number of boxes)
  const batchSize = batch.batchSize ? `${batch.batchSize} boxes` : "-";

  tr.innerHTML = `
    <td class="mono">${batch.id}</td>
    <td>${batch.name || "-"}</td>
    <td>${batch.origin || "-"}</td>
    <td><span class="stage-badge ${stageClass}">${stageName}</span></td>
    <td class="mono">${batchSize}</td>
    <td class="mono" title="${batch.creator || ""}">${fmtAddr(batch.creator)}</td>
    <td class="mono" title="${batch.holder || ""}">${fmtAddr(batch.holder)}</td>
    <td class="mono">${fmtTs(batch.lastUpdate)}</td>
  `;

  tr.addEventListener("click", () => openTimeline(batch.id));
  el.list.appendChild(tr);
}

async function loadBatches() {
  if (!contract) { return; }
  try {
    // Strategy: try getBatchCount() then getBatchDetails(i).
    // Fallback: if no counter, attempt sequential ids until a gap (best-effort).
    clearTable();
    let count = 0;
    try { count = parseInt(await contract.methods.getBatchCount().call()); } catch { }

    const batches = [];
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const b = await readBatch(i);
        // 🚫 Skip empty/default entries
        if (b && b.id !== "0" && b.holder !== "0x0000000000000000000000000000000000000000") {
          batches.push(b);
        }
      }
    } else {
      // best-effort scan first 200 ids
      for (let i = 0; i < 200; i++) {
        const b = await readBatch(i).catch(() => null);
        if (
          b &&
          b.exists &&
          b.id !== "0" &&
          b.holder !== "0x0000000000000000000000000000000000000000"
        ) {
          batches.push(b);
        }
      }
    }

    // sort by lastUpdate desc
    batches.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0));

    if (batches.length === 0) {
      el.list.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted" id="emptyMsg">No batches yet</td></tr>`;
      return;
    }

    for (const b of batches) addRow(b);
  } catch (e) {
    console.error(e);
    showAlert(`Failed to load batches: ${e.message}`, "danger", 8000);
  }
}


async function readBatch(id) {
  // 1) Try your contract's helper first
  try {
    const r = await contract.methods.getBatch(id).call();
    const b = {
      id: Number(r.id ?? r[0]),
      name: String(r.name ?? r[1]),
      origin: String(r.origin ?? r[2]),
      stage: Number(r.stage ?? r[3] ?? 0),
      holder: String(r.holder ?? r.currentHolder ?? r[4] ?? ""),
      expiry: Number(r.expiryDate ?? r[5] ?? 0),
      conditionOk: (r.conditionOk ?? r[6]) ? true : false,
      batchSize: Number(r.batchSize ?? r[7] ?? 0),
      creator: String(r.creator ?? r[8] ?? ""),
      exists: true,
    };
    b.lastUpdate = await inferLastUpdateTs(id);
    return b;
  } catch (e1) {
    // 2) Fallback to old APIs (if you keep older artifacts)
    try {
      const r = await contract.methods.getBatchDetails(id).call();
      const b = {
        id: Number(r.id ?? r[0]),
        name: String(r.name ?? r[1]),
        origin: String(r.origin ?? r[2]),
        stage: Number(r.stage ?? r[3] ?? 0),
        holder: String(r.currentHolder ?? r[4] ?? ""),
        expiry: Number(r.expiryDate ?? r[5] ?? 0),
        conditionOk: (r.conditionOk ?? r[6]) ? true : false,
        batchSize: Number(r.batchSize ?? r[7] ?? 0),
        creator: String(r.creator ?? r[8] ?? ""),
        exists: true,
      };
      b.lastUpdate = await inferLastUpdateTs(id);
      return b;
    } catch (e2) {
      try {
        const r = await contract.methods.batches(id).call();
        const b = {
          id,
          name: String(r.name ?? "-"),
          origin: String(r.origin ?? "-"),
          stage: Number(r.stage ?? 0),
          holder: String(r.currentHolder ?? r.holder ?? ""),
          expiry: Number(r.expiryDate ?? r.expiry ?? 0),
          conditionOk: (r.conditionOk ?? true) ? true : false,
          batchSize: Number(r.batchSize ?? 0),
          creator: String(r.creator ?? ""),
          exists: !!(r.name ?? r.origin),
        };
        b.lastUpdate = await inferLastUpdateTs(id);
        return b;
      } catch {
        return null;
      }
    }
  }
}

// helper: strict boolean from possible undefined/strings
function ifFalseElse(v) { return v === false ? false : !!v; }

async function inferLastUpdateTs(id) {
  try {
    const evs = await eventsForId(id);
    if (!evs.length) return 0;
    const last = evs[evs.length - 1];
    if (last.blockTimestamp) return last.blockTimestamp;
    const block = await web3.eth.getBlock(last.blockNumber);
    return Number(block.timestamp);
  } catch { return 0; }
}

// ---------- timeline
async function openTimeline(id) {
  try {
    const b = await readBatch(id);
    el.tl.id.textContent = b.id;
    el.tl.name.textContent = b.name || "-";
    el.tl.origin.textContent = b.origin || "-";
    el.tl.holder.textContent = b.holder || "-";
    el.tl.expiry.textContent = b.expiry ? fmtDateFromEpochSec(b.expiry) : "-";
    el.tl.cond.textContent = b.conditionOk ? "OK" : "Bad";
    el.tl.last.textContent = fmtTs(b.lastUpdate);

    const evs = await eventsForId(id);
    renderTimeline(evs);

    // transfer count
    const tcount = evs.filter(e =>
      e.event === 'StageUpdated' || e.event === 'HolderChanged' || e.event === 'Transfer').length;
    el.tl.transferCount.textContent = String(tcount);

    // set condition selector to current value
    el.tl.condSel.value = b.conditionOk ? 'true' : 'false';

    // Check if current user is the holder
    const isCurrentHolder = account && b.holder && account.toLowerCase() === b.holder.toLowerCase();
    const isBatchBad = !b.conditionOk;

    // Check user roles
    const userIsWarehouse = account ? await isWarehouse(account) : false;
    const userIsStore = account ? await isStore(account) : false;
    const isInStoreStage = b.stage === 3; // Stage.Store

    // Disable condition selector if batch is bad (no reverting allowed)
    el.tl.condSel.disabled = isBatchBad;

    // Authorized stores list and check must be computed before use
    const authorizedStores = [
      "0x0Aea37631823f63bE96694ba14fE7e0C5bd61E4A",
      "0x745C9102C727ccf84159Cd5E193b32583BC371c5"
    ];
    const isSpecificStoreAccount = authorizedStores.some(storeAddr =>
      isSpecificStore(account, storeAddr)
    );

    // Show/hide Mark as Sold button for stores
    const canMarkAsSold = (userIsStore || isSpecificStoreAccount) && isCurrentHolder && isInStoreStage && !isBatchBad;

    console.log("Debug Mark as Sold:", {
      userIsStore,
      isSpecificStoreAccount,
      isCurrentHolder,
      isInStoreStage,
      isBatchBad,
      stage: b.stage,
      stageName: ["Created", "Transported", "Warehoused", "Store", "Sold"][b.stage],
      account,
      holder: b.holder,
      authorizedStores
    });

    if (canMarkAsSold) {
      el.tl.markSoldCard.style.display = "block";
      el.tl.markSoldBtn.disabled = false;
      el.tl.markSoldBtn.className = "btn btn-success btn-block mt-4";
    } else {
      // Show the card for stores even if conditions aren't met, but disable the button
      if (userIsStore || isSpecificStoreAccount) {
        el.tl.markSoldCard.style.display = "block";
        el.tl.markSoldBtn.disabled = true;
        el.tl.markSoldBtn.className = "btn btn-outline-secondary btn-block mt-4";

        // Update button text based on why it's disabled
        if (!isCurrentHolder) {
          el.tl.markSoldBtn.textContent = "Mark as Sold (Not Holder)";
        } else if (!isInStoreStage) {
          const currentStage = ["Created", "Transported", "Warehoused", "Store", "Sold"][b.stage];
          if (b.stage < 3) {
            el.tl.markSoldBtn.textContent = `Mark as Sold (Advance to Store stage first - Current: ${currentStage})`;
          } else {
            el.tl.markSoldBtn.textContent = `Mark as Sold (Already ${currentStage})`;
          }
        } else if (isBatchBad) {
          el.tl.markSoldBtn.textContent = "Mark as Sold (Batch Bad)";
        } else {
          el.tl.markSoldBtn.textContent = "Mark as Sold";
        }
      } else {
        el.tl.markSoldCard.style.display = "none";
        el.tl.markSoldBtn.disabled = true;
      }
    }

    // Show holder status indicator
    if (account && b.holder) {
      el.tl.holderStatusAlert.classList.remove("d-none");
      if (isCurrentHolder) {
        if (isBatchBad) {
          el.tl.holderStatusAlert.className = "alert alert-danger mb-3";
          el.tl.holderStatusIcon.innerHTML = "🚫";
          el.tl.holderStatusText.textContent = `You are the current holder, but this batch is marked as "Bad". Transfers and condition updates are permanently disabled.`;
        } else {
          el.tl.holderStatusAlert.className = "alert alert-success mb-3";
          el.tl.holderStatusIcon.innerHTML = "✓";
          let statusText = `You are the current holder of this batch. You can transfer and update conditions.`;

          // Add store-specific information
          if (userIsStore || isSpecificStoreAccount) {
            const stageName = ["Created", "Transported", "Warehoused", "Store", "Sold"][b.stage];
            statusText += ` As a store, you can mark this batch as sold when it reaches Store stage. Current stage: ${stageName}.`;
          }

          el.tl.holderStatusText.textContent = statusText;
        }
      } else {
        el.tl.holderStatusAlert.className = "alert alert-warning mb-3";
        el.tl.holderStatusIcon.innerHTML = "⚠";
        let statusText = `You are not the current holder. Only ${fmtAddr(b.holder)} can transfer or update conditions.`;

        // Add store-specific information
        if (userIsStore || isSpecificStoreAccount) {
          statusText += ` As a store, you need to be the current holder to mark batches as sold.`;
        }

        el.tl.holderStatusText.textContent = statusText;
      }
    } else {
      el.tl.holderStatusAlert.classList.add("d-none");
    }

    // Enable/disable buttons based on holder status and batch condition
    const canTransfer = isCurrentHolder && !isBatchBad;
    const canUpdateCondition = isCurrentHolder && !isBatchBad;

    el.tl.transferBtn.disabled = !canTransfer;
    el.tl.condBtn.disabled = !canUpdateCondition;

    // Update button text and styling
    if (!isCurrentHolder) {
      el.tl.transferBtn.textContent = "Transfer (Not Holder)";
      el.tl.transferBtn.className = "btn btn-outline-secondary btn-block mt-4";
      el.tl.condBtn.textContent = "Update (Not Holder)";
      el.tl.condBtn.className = "btn btn-outline-secondary btn-block mt-4";
    } else if (isBatchBad) {
      el.tl.transferBtn.textContent = "Transfer (Batch Bad)";
      el.tl.transferBtn.className = "btn btn-outline-danger btn-block mt-4";
      el.tl.condBtn.textContent = "Update (Permanent Bad)";
      el.tl.condBtn.className = "btn btn-outline-danger btn-block mt-4";
    } else {
      el.tl.transferBtn.textContent = "Transfer";
      el.tl.transferBtn.className = "btn btn-primary btn-block mt-4";
      el.tl.condBtn.textContent = "Update";
      el.tl.condBtn.className = "btn btn-secondary btn-block mt-4";
    }

    // remember which batch is open
    document.getElementById('timelineModal').dataset.batchId = String(id);

    // open modal (vanilla Bootstrap)
    const modal = new bootstrap.Modal(document.getElementById('timelineModal'));
    modal.show();

  } catch (e) {
    showAlert(`Failed to load timeline: ${e.message}`, "danger", 8000);
  }
}


function renderTimeline(events) {
  el.tl.list.innerHTML = "";
  if (!events.length) {
    el.tl.list.innerHTML = `<li><div class="text-muted">No events found.</div></li>`;
    return;
  }
  for (const ev of events) {
    const li = document.createElement("li");
    const who = ev.returnValues?.by || ev.returnValues?.from || ev.returnValues?.holder || ev.returnValues?.owner || ev.returnValues?.sender || "";
    const ts = ev.blockTimestamp ? fmtTs(ev.blockTimestamp) : `#${ev.blockNumber}`;
    const descr = describeEvent(ev);
    li.innerHTML = `
      <div class="tiny text-muted mono">${ts} · ${fmtAddr(who)}</div>
      <div><strong>${ev.event || "Event"}</strong> — ${descr}</div>
    `;
    el.tl.list.appendChild(li);
  }
}

function describeEvent(ev) {
  const v = ev.returnValues || {};
  switch (ev.event) {
    case "BatchCreated":
      return `Created "${v.name ?? ""}" (id=${v.id ?? v.batchId ?? "-"}) at origin ${v.origin ?? "-"}`;
    case "StageUpdated":
      return `Stage → ${v.newStage ?? v.stage} · Holder → ${v.holder ?? v.newHolder ?? "-"}`;
    case "HolderChanged":
    case "Transfer":
      return `Holder → ${v.to ?? v.newHolder ?? v.holder ?? "-"}`;
    case "ConditionUpdated":
      return `Condition → ${v.ok ?? v.conditionOk ?? v.condition ?? "-"}`;
    default:
      return Object.keys(v).length ? JSON.stringify(v) : "—";
  }
}


async function eventsForId(id) {
  // Grab all events, filter by id/batchId where present, and attach timestamps
  // Note: some local Ganache setups require fromBlock:0 toNumber('latest')
  const all = await contract.getPastEvents("allEvents", { fromBlock: 0, toBlock: "latest" });
  const mine = all.filter((e) => {
    const v = e.returnValues || {};
    const evId = v.id ?? v.batchId ?? v._id;
    return String(evId) === String(id);
  });

  // Attach block timestamps (cache blocks by number to reduce RPC load)
  const cache = new Map();
  for (const e of mine) {
    if (!cache.has(e.blockNumber)) {
      cache.set(e.blockNumber, await web3.eth.getBlock(e.blockNumber));
    }
    e.blockTimestamp = Number(cache.get(e.blockNumber).timestamp);
  }
  // sort ascending by time
  mine.sort((a, b) => (a.blockTimestamp || 0) - (b.blockTimestamp || 0));
  return mine;
}
// ---------- modal actions
if (el.tl.transferBtn) {
  el.tl.transferBtn.addEventListener("click", async () => {
    try {
      const id = Number(document.getElementById('timelineModal').dataset.batchId);
      const batch = await readBatch(id);

      // Check if current user is the holder
      const isCurrentHolder = account && batch.holder && account.toLowerCase() === batch.holder.toLowerCase();

      if (!isCurrentHolder) {
        showAlert(`Only the current holder (${fmtAddr(batch.holder)}) can transfer this batch.`, "warning", 8000);
        return;
      }

      // Check if batch is marked as bad
      if (!batch.conditionOk) {
        showAlert(`Cannot transfer batch #${id}. This batch is marked as "Bad" and transfers are disabled.`, "danger", 8000);
        return;
      }

      const to = (el.tl.to.value || "").trim();
      if (!web3.utils.isAddress(to)) throw new Error("Invalid address.");
      await doTransfer(id, to);
      showAlert(`Transferred batch #${id} to ${to}.`, "success");
      await loadBatches();
      openTimeline(id); // refresh the modal view
    } catch (e) {
      showAlert(`Transfer failed: ${e.message}`, "danger", 9000);
    }
  });
}

if (el.tl.condBtn) {
  el.tl.condBtn.addEventListener("click", async () => {
    try {
      const id = Number(document.getElementById('timelineModal').dataset.batchId);
      const batch = await readBatch(id);

      // Check if current user is the holder
      const isCurrentHolder = account && batch.holder && account.toLowerCase() === batch.holder.toLowerCase();

      if (!isCurrentHolder) {
        showAlert(`Only the current holder (${fmtAddr(batch.holder)}) can update the condition of this batch.`, "warning", 8000);
        return;
      }

      // Check if batch is already marked as bad (no reverting allowed)
      if (!batch.conditionOk) {
        showAlert(`Cannot update condition for batch #${id}. This batch is permanently marked as "Bad" and cannot be reverted.`, "danger", 8000);
        return;
      }

      const ok = el.tl.condSel.value === "true";
      await doUpdateCondition(id, ok);
      showAlert(`Condition updated for batch #${id} → ${ok ? "OK" : "Bad"}.`, "success");
      await loadBatches();
      openTimeline(id);
    } catch (e) {
      showAlert(`Update condition failed: ${e.message}`, "danger", 9000);
    }
  });
}

if (el.tl.markSoldBtn) {
  el.tl.markSoldBtn.addEventListener("click", async () => {
    try {
      const id = Number(document.getElementById('timelineModal').dataset.batchId);
      const batch = await readBatch(id);

      // Check if current user is the holder
      const isCurrentHolder = account && batch.holder && account.toLowerCase() === batch.holder.toLowerCase();

      if (!isCurrentHolder) {
        showAlert(`Only the current holder (${fmtAddr(batch.holder)}) can mark this batch as sold.`, "warning", 8000);
        return;
      }

      // Check if user is authorized as store
      const userIsStore = account ? await isStore(account) : false;
      const authorizedStores = [
        "0x0Aea37631823f63bE96694ba14fE7e0C5bd61E4A",
        "0x745C9102C727ccf84159Cd5E193b32583BC371c5"
      ];
      const isSpecificStoreAccount = authorizedStores.some(storeAddr =>
        isSpecificStore(account, storeAddr)
      );

      if (!userIsStore && !isSpecificStoreAccount) {
        showAlert(`Only authorized stores can mark batches as sold.`, "warning", 8000);
        return;
      }

      // Check if batch is in Store stage
      if (batch.stage !== 3) {
        showAlert(`Batch must be in Store stage to mark as sold. Current stage: ${["Created", "Transported", "Warehoused", "Store", "Sold"][batch.stage]}.`, "warning", 8000);
        return;
      }

      await doMarkAsSold(id);
      showAlert(`Batch #${id} marked as sold!`, "success");
      await loadBatches();
      openTimeline(id);
    } catch (e) {
      showAlert(`Mark as sold failed: ${e.message}`, "danger", 9000);
    }
  });
}
// ---------- create flow
el.formCreate.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!contract) { return; }
  const name = $("#name").value.trim();
  const origin = $("#origin").value.trim();
  const batchSize = parseInt($("#batchSize").value) || 0;
  const ds = $("#expiry").value;
  let expiry = 0;
  if (ds) {
    expiry = Math.floor(new Date(ds + "T00:00:00Z").getTime() / 1000);
  }
  try {
    const m = contract.methods.createBatch(name, origin, expiry, batchSize);
    await callWithRevertReason(m, account);  // simulation
    const tx = await m.send({ from: account });
    showAlert(`Created batch #${tx?.events?.BatchCreated?.returnValues?.id ?? ""} with ${batchSize} boxes`, "success");
    e.target.reset();
    await loadBatches();
  } catch (err) {
    showAlert(`Create failed: ${err.message}`, "danger", 8000);
  }
});

// ---------- boot
el.btnConnect.addEventListener("click", connect);

// auto-init if already granted
if (window.ethereum && window.ethereum.selectedAddress) { connect(); }
