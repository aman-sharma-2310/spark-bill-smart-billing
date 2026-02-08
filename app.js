// app.js — SparkBill Dark Mode Pro (Firebase Firestore v11 Modular)
import { db } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
// import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let tempBillData = null;


// Set default bill date to today
const billDateInput = document.getElementById("billDateInput");
if (billDateInput) billDateInput.value = new Date().toISOString().split("T")[0];

// 📦 DOM References
const tenantSelect = document.getElementById("tenantSelect");
const currInput = document.getElementById("curr");
const billResult = document.getElementById("billResult");
const unitPriceInput = document.getElementById("unitPrice");
const roomInput = document.getElementById("room");
const nameInput = document.getElementById("name");
const prevInput = document.getElementById("prev");
const rentInput = document.getElementById("rent");
const viewRoomInput = document.getElementById("viewRoom");
const recordsResult = document.getElementById("recordsResult");
const exportRoomBtn = document.getElementById("exportRoomBtn");

const addTenantBtn = document.getElementById("addTenantBtn");
const saveUnitBtn = document.getElementById("saveUnitBtn");
const calcBtnDo = document.getElementById("calcBtnDo");
const showRecordsBtn = document.getElementById("showRecordsBtn");

// Sidebar stats + tenant list
const statTenants = document.getElementById("statTenants");
const statUnpaid = document.getElementById("statUnpaid");
const tenantList = document.getElementById("tenantList");

// 🧰 Utility Helpers
const toast = (msg) => alert(msg);
const fmtDate = (d) =>
  d && d.toDate
    ? new Date(d.toDate()).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : d;

// ⚙️ Load unit price + tenants initially
async function loadUnitAndTenants() {
  try {
    const sdoc = await getDoc(doc(db, "settings", "global"));
    if (sdoc.exists()) {
      const data = sdoc.data();
      unitPriceInput.value = data.unitPrice || 8;
      document.getElementById("unitPriceSettings").value = data.unitPrice || 8;
    } else {
      unitPriceInput.value = 8;
      document.getElementById("unitPriceSettings").value = 8;
      await setDoc(doc(db, "settings", "global"), { unitPrice: 8 });
      console.log("🆕 Initialized default unit rate: ₹8");
    }
  } catch (e) {
    console.error("Unit price load error:", e);
    unitPriceInput.value = 8;
    document.getElementById("unitPriceSettings").value = 8;
  }

  await populateTenantSelect();
  await populateTenantList();
  await updateStats();
}

// 🔽 Populate tenant dropdown (Calculator)
async function populateTenantSelect() {
  tenantSelect.innerHTML = '<option value="">-- Select Tenant --</option>';
  const snap = await getDocs(collection(db, "tenants"));
  snap.forEach((d) => {
    const t = d.data();
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${t.room} - ${t.name}`;
    tenantSelect.appendChild(opt);
  });

  if (window.tenantChoice) window.tenantChoice.destroy();
  window.tenantChoice = new Choices("#tenantSelect", {
    shouldSort: false,
    searchPlaceholderValue: "Search tenant...",
  });
}

// 🏠 Populate sidebar tenant list
let allTenants = [];  // 🔥 global array

async function populateTenantList() {
  tenantList.innerHTML = "Loading tenants...";
  allTenants = [];  // reset

  try {
    const snap = await getDocs(collection(db, "tenants"));

    if (snap.empty) {
      tenantList.innerHTML = "<div class='small'>No tenants added yet</div>";
      return;
    }

    tenantList.innerHTML = "";
    snap.forEach((docSnap) => {
      const t = docSnap.data();
      allTenants.push(t);   // 🔥 store tenant
    });

    renderTenantList(allTenants); // 🎯 render normally

  } catch (e) {
    console.error("Tenant list load error:", e);
    tenantList.innerHTML = "Error loading tenants.";
  }
}

// render function for rendering all + filtered tenants
function renderTenantList(list) {
  tenantList.innerHTML = "";
  const d = new Date();
  const c_month = d.toLocaleString('en-US', { month: 'short' }) + " " + d.getFullYear();
  list.forEach(t => {
    const div = document.createElement("div");
    div.className = "tenant-item";
    div.innerHTML = `
    <div>
      <div style="display:flex; align-items:center;">
        <div><b>${t.room}</b> — ${t.name}
        <div class="tenant-meta" style="margin-bottom:15px;">
          Total: ₹${t.total_rent} | Units: ${t.unit_used} | Prev: ${t.prev}
        </div>
        </div>
          <select onchange="updatePaymentStatus('${t.room}','${c_month}', this.value)"
            style="
              width:65px;
              height:auto;
              margin-left:auto;
              padding:5px 8px;
              background:#0f1720;
              color:#e6eef6;
              border:2px solid #ced7e3ff;
              border-radius:6px;
              text-align:center;
              cursor:pointer;
              outline:none;
              transition:0.2s ease;
            ">
            <option value="Unpaid" ${t.paidStat === "Unpaid" ? "selected" : ""}>Unpaid</option>
            <option value="Paid" ${t.paidStat === "Paid" ? "selected" : ""}>Paid</option>
          </select>
      </div>

      <div style="display:flex;">
        
      </div>
    </div>

    `;
    tenantList.appendChild(div);
  });
}
const searchBox = document.getElementById("tenantSearch");

searchBox.addEventListener("input", () => {
  const q = searchBox.value.trim().toLowerCase();

  const filtered = allTenants.filter(t =>
    t.room.toString().toLowerCase().includes(q) ||
    t.name.toLowerCase().includes(q)
  );

  renderTenantList(filtered);
});


// 📊 Update stats (total tenants + unpaid count)
async function updateStats() {
  try {
    const tenantsSnap = await getDocs(collection(db, "tenants"));
    statTenants.textContent = tenantsSnap.size;
    let unpaidCount = 0;
    for (const t of tenantsSnap.docs) {
      const billsSnap = await getDocs(
        query(
          collection(db, "tenants", t.id, "bills"),
          where("paymentStatus", "==", "Unpaid")
        )
      );
      unpaidCount += billsSnap.size;
    }
    statUnpaid.textContent = unpaidCount;
    populateTenantList();
  } catch (e) {
    console.error("Stats update error:", e);
    statTenants.textContent = statUnpaid.textContent = "—";
  }
}

// ➕ Add Tenant
addTenantBtn.addEventListener("click", async () => {
  const room = roomInput.value.trim();
  const name = nameInput.value.trim();
  const prev = Number(prevInput.value);
  const rent = Number(rentInput.value);
  const rate = Number(unitPriceInput.value) || 8;

  if (!room || !name || isNaN(prev) || isNaN(rent))
    return toast("Please fill all fields");

  try {
    await setDoc(doc(db, "tenants", room), {
      room,
      name,
      prev,
      rent,
      rate,
      lastUpdated: serverTimestamp(),
      total_rent: rent,
      unit_used: 0
    });
    toast(`✅ Tenant ${name} added`);
    roomInput.value = nameInput.value = prevInput.value = rentInput.value = "";
    await populateTenantSelect();
    await populateTenantList();
    await updateStats();
  } catch (e) {
    console.error(e);
    toast("❌ Failed to add tenant");
  }
});

// ⚡ Save Unit Price (Settings)
saveUnitBtn.addEventListener("click", async () => {
  const price = Number(document.getElementById("unitPriceSettings").value);
  if (isNaN(price) || price <= 0) return toast("Enter valid price");
  await setDoc(doc(db, "settings", "global"), { unitPrice: price }, { merge: true });
  unitPriceInput.value = price;
  toast(`⚡ Unit Price set to ₹${price}`);
});

// 🧾 Calculate Bill Temp
calcBtnDo.addEventListener("click", async () => {
  const room = tenantSelect.value;
  const curr = Number(currInput.value);
  const selectedDate = billDateInput.value ? new Date(billDateInput.value) : new Date();

  if (!room || isNaN(curr)) return toast("Select tenant & enter current reading");

  try {
    const tSnap = await getDoc(doc(db, "tenants", room));
    if (!tSnap.exists()) return toast("Tenant not found");
    const t = tSnap.data();

    const units = curr - Number(t.prev);
    if (units < 0) return toast("Current reading < previous");

    const rate = Number(unitPriceInput.value) || t.rate || 8;
    const bill = +(units * rate).toFixed(2);
    const total = bill + Number(t.rent);

    const monthStr = selectedDate.toLocaleString("default", {
      month: "short",
      year: "numeric"
    });

    // 💾 Store in TEMP memory (NOT saved to DB)
    tempBillData = {
      room: t.room,
      name: t.name,
      monthStr,
      prev: t.prev,
      curr,
      units,
      rate,
      bill,
      rent: t.rent,
      total,
      billDate: selectedDate
    };

    // 📊 Display Result
    billResult.innerHTML = `
      <table class="result-table">
        <tr><th>Room</th><td>${t.room}</td></tr>
        <tr><th>Name</th><td>${t.name}</td></tr>
        <tr><th>Prev Reading</th><td>${t.prev}</td></tr>
        <tr><th>Curr Reading</th><td>${curr}</td></tr>
        <tr><th>Units Used</th><td>${units}</td></tr>
        <tr><th>Rate</th><td>${rate}</td></tr>
        <tr class="highlight-row"><th>Bill</th><td><b>${bill}</b></td></tr>
        <tr><th>Rent</th><td>${t.rent}</td></tr>
        <tr class="highlight-total"><th>Total</th><td><b>${total}</b></td></tr>
      </table>
    `;

    // toast("🧮 Bill calculated!");
  } catch (e) {
    console.error(e);
    toast("❌ Calculation failed");
  }
});
// Save Bill in DB
saveBtnDo.addEventListener("click", async () => {
  if (!tempBillData) return toast("Calculate bill first!");

  const d = tempBillData;

  try {
    const billRef = doc(db, "tenants", d.room, "bills", d.monthStr);
    const billSnap = await getDoc(billRef);

    if (billSnap.exists()) {
      return toast(`⚠️ Bill for ${d.monthStr} already saved!`);
    }

    // Save Bill
    await setDoc(billRef, {
      month: d.monthStr,
      prev: d.prev,
      curr: d.curr,
      units: d.units,
      rate: d.rate,
      bill: d.bill,
      rent: d.rent,
      total: d.total,
      billDate: d.billDate,
      paymentStatus: "Unpaid",
      room: d.room,
      name: d.name,
    });

    // Update tenant info
    await updateDoc(doc(db, "tenants", d.room), {
      total_rent: d.total,
      unit_used: d.units,
      prev: d.curr,
      lastUpdated: serverTimestamp(),
      paidStat: "Unpaid"
    });

    toast("💾 Bill saved successfully!");
    tempBillData = null; // Clear temp after saving

    await updateStats();
  } catch (e) {
    console.error(e);
    toast("❌ Failed to save bill");
  }
});


// 📋 View Records
let lastFetchedRoomData = [];

showRecordsBtn.addEventListener("click", async () => {
  const room = viewRoomInput.value.trim();
  if (!room) return toast("Enter a room number");
  recordsResult.innerHTML = "⏳ Loading...";
  exportRoomBtn.disabled = true;

  try {
    const billsSnap = await getDocs(
      query(collection(db, "tenants", room, "bills"), orderBy("billDate", "desc"))
    );
    const tenantRef = doc(db, "tenants", room);
    const tenantSnap = await getDoc(tenantRef);
    const n = tenantSnap.data();
    if (billsSnap.empty) {
      recordsResult.innerHTML = "⚠️ No records found.";
      exportRoomBtn.disabled = true;
      return;
    }

    const data = billsSnap.docs.map((d) => {
      const x = d.data();
      if (x.billDate?.toDate) x.billDate = fmtDate(x.billDate);
      return x;
    });

    lastFetchedRoomData = data.map((r) => ({
      Room: room,
      Name: n.name || "—",
      Month: r.month || "—",
      Prev_Reading: r.prev || "—",
      Curr_Reading: r.curr || "—",
      Units: r.units || "—",
      Rate: r.rate || "—",
      Bill: r.bill || "—",
      Rent: r.rent || "—",
      Total: r.total || "—",
      Payment: r.paymentStatus || "Unpaid",
    }));

    exportRoomBtn.disabled = false;

    const keys = ["month", "prev", "curr", "units", "rate", "bill", "rent", "total", "paymentStatus"];
    let html = `<div class="scroll-table"><table class="records"><thead><tr>`;
    keys.forEach((k) => (html += `<th>${k}</th>`));
    html += `<th>Change Payment</th></tr></thead><tbody>`;

    data.forEach((d) => {
      html += `<tr>`;
      keys.forEach((k) => (html += `<td>${d[k] ?? ""}</td>`));
      const month = d.month;
      const status = d.paymentStatus || "Unpaid";
      html += `<td><select onchange="updatePaymentStatus('${room}','${month}',this.value)">
        <option value="Unpaid" ${status === "Unpaid" ? "selected" : ""}>Unpaid</option>
        <option value="Paid" ${status === "Paid" ? "selected" : ""}>Paid</option>
      </select></td></tr>`;
    });

    html += "</tbody></table></div>";
    recordsResult.innerHTML = html;
  } catch (e) {
    console.error(e);
    recordsResult.innerHTML = "❌ Failed to load records.";
  }
});

// 📤 Export Room Data
exportRoomBtn.addEventListener("click", () => {
  if (!lastFetchedRoomData.length) return toast("No data to export");
  const choice = prompt("Export as: 1️⃣ CSV  2️⃣ Excel  3️⃣ PDF\nEnter 1, 2 or 3");
  if (choice === "1") exportCSV(lastFetchedRoomData);
  else if (choice === "2") exportExcel(lastFetchedRoomData);
  else if (choice === "3") exportPDF(lastFetchedRoomData);
  else toast("Cancelled");
});

function exportCSV(data) {
  const csv = [
    Object.keys(data[0]).join(","),
    ...data.map((r) => Object.values(r).map((v) => `"${v}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `SparkBill_${data[0].Room}_Records.csv`;
  link.click();
}

function exportExcel(data) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Records");
  XLSX.writeFile(wb, `SparkBill_${data[0].Room}_Records.xlsx`);
}

function exportPDF(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.text(`SparkBill — ${data[0].Name} Room ${data[0].Room}' Records`, 14, 14);
  const rows = data.map((d) => [
    d.Room,
    d.Month,
    d.Prev_Reading,
    d.Curr_Reading,
    d.Units,
    d.Rate,
    d.Bill,
    d.Rent,
    d.Total,
    d.Payment,
  ]);

  doc.autoTable({
    head: [["Room", "Month", "Prev", "Curr", "Units", "Rate", "Bill", "Rent", "Total", "Payment"]],
    body: rows,
    startY: 20,
    styles: { fontSize: 9 },
  });

  doc.save(`SparkBill_${data[0].Room}_Records.pdf`);
}

// 💰 Update Payment Status
window.updatePaymentStatus = async function (room, month, status) {
  try {
    const billRef = doc(db, "tenants", room, "bills", month);
    await updateDoc(billRef, { paymentStatus: status });
    toast(`✅ Status updated to "${status}"`);
    showRecordsBtn.click();
    await updateStats();
    const d = new Date();
    const c_month = d.toLocaleString('en-US', { month: 'short' }) + " " + d.getFullYear();
    if (c_month === month) {
      await updateDoc(doc(db, "tenants", room), {
        paidStat: status
      });
    }

  } catch (e) {
    console.error(e);
    toast("❌ Failed to update payment");
  }
};

// 🔄 Refresh function for topbar button
window.refreshData = async function () {
  await loadUnitAndTenants();
  toast("🔁 Data refreshed");
};

// 🚀 Init everything
loadUnitAndTenants();
