import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── FIREBASE CONFIG ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB7jBZ9crwzaCSLfKazoX7E_D214-_MXjg",
  authDomain: "chickenricepos.firebaseapp.com",
  databaseURL: "https://chickenricepos-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chickenricepos",
  storageBucket: "chickenricepos.firebasestorage.app",
  messagingSenderId: "930638451798",
  appId: "1:930638451798:web:5e12d20546b01b622ad7f7",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ─── DEFAULT MENU ─────────────────────────────────────────────────────────────
const DEFAULT_MENU = [
  {
    id: 1, category: "Chicken Rice",
    items: [
      { id: 101, name: "Roasted Chicken Rice", price: 3.50, emoji: "🍗", desc: "Fragrant rice with roasted chicken", outOfStock: false },
      { id: 102, name: "Steamed Chicken Rice",  price: 3.50, emoji: "🍚", desc: "Tender steamed chicken with ginger rice", outOfStock: false },
      { id: 103, name: "Mixed Chicken Rice",    price: 4.00, emoji: "🍱", desc: "Half roasted, half steamed", outOfStock: false },
    ],
  },
  {
    id: 2, category: "Add-ons",
    items: [
      { id: 201, name: "Extra Chicken", price: 2.00, emoji: "🍗", desc: "Additional chicken portion", outOfStock: false },
      { id: 202, name: "Extra Rice",    price: 0.50, emoji: "🍚", desc: "An extra scoop of rice",    outOfStock: false },
      { id: 203, name: "Braised Egg",   price: 0.80, emoji: "🥚", desc: "Slow-cooked soy braised egg", outOfStock: false },
      { id: 204, name: "Chilli Sauce",  price: 0.20, emoji: "🌶️", desc: "Signature house chilli",   outOfStock: false },
    ],
  },
  {
    id: 3, category: "Drinks",
    items: [
      { id: 301, name: "Barley Water",      price: 1.20, emoji: "🥤", desc: "Refreshing cold barley", outOfStock: false },
      { id: 302, name: "Chrysanthemum Tea", price: 1.20, emoji: "🍵", desc: "Light and floral",       outOfStock: false },
      { id: 303, name: "Plain Water",       price: 0.50, emoji: "💧", desc: "Chilled mineral water",  outOfStock: false },
    ],
  },
];

const EMOJIS = ["🍗","🍚","🍱","🥚","🌶️","🥤","🍵","💧","🍜","🥩","🧆","🫙","🧃","🥗","🍲","🫕","🧋","☕"];
let nextId = 500;
function genId() { return nextId++; }

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────
async function fbGetMenu() {
  try {
    const snap = await get(ref(db, "menu"));
    if (snap.exists()) return snap.val();
    await set(ref(db, "menu"), DEFAULT_MENU);
    return DEFAULT_MENU;
  } catch { return DEFAULT_MENU; }
}
async function fbSetMenu(menu) {
  try { await set(ref(db, "menu"), menu); } catch(e) { console.error(e); }
}
async function fbGetQueue() {
  try {
    const snap = await get(ref(db, "currentServing"));
    return snap.exists() ? snap.val() : 40;
  } catch { return 40; }
}
async function fbSetQueue(n) {
  try { await set(ref(db, "currentServing"), n); } catch(e) { console.error(e); }
}
async function fbPushOrder(order) {
  try { await push(ref(db, "orders"), order); } catch(e) { console.error(e); }
}
async function fbUpdateOrder(fbKey, data) {
  try { await update(ref(db, `orders/${fbKey}`), data); } catch(e) { console.error(e); }
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  const [menu, setMenu] = useState(null);
  const [orders, setOrders] = useState([]);
  const [currentServing, setCurrentServing] = useState(40);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Load menu once
    fbGetMenu().then(m => { setMenu(m); setConnected(true); });

    // Live listen to currentServing
    const qRef = ref(db, "currentServing");
    const unsubQ = onValue(qRef, snap => {
      if (snap.exists()) setCurrentServing(snap.val());
    });

    // Live listen to orders
    const oRef = ref(db, "orders");
    const unsubO = onValue(oRef, snap => {
      if (snap.exists()) {
        const data = snap.val();
        const arr = Object.entries(data).map(([fbKey, val]) => ({ ...val, fbKey }));
        arr.sort((a, b) => a.timestamp - b.timestamp);
        setOrders(arr);
      } else {
        setOrders([]);
      }
    });

    return () => { unsubQ(); unsubO(); };
  }, []);

  const updateMenu = useCallback(async (newMenu) => {
    setMenu(newMenu);
    await fbSetMenu(newMenu);
  }, []);

  const addOrder = useCallback(async (order) => {
    await fbPushOrder(order);
  }, []);

  const markOrderDone = useCallback(async (fbKey) => {
    await fbUpdateOrder(fbKey, { status: "done" });
  }, []);

  const advanceQueue = useCallback(async () => {
    const next = currentServing + 1;
    setCurrentServing(next);
    await fbSetQueue(next);
  }, [currentServing]);

  if (!menu) return <LoadingScreen />;

  return (
    <div style={{fontFamily:"'Segoe UI',sans-serif"}}>
      {!connected && <div style={{position:"fixed",top:0,left:0,right:0,zIndex:999,background:"#f59e0b",color:"#1a1a2e",padding:"8px",textAlign:"center",fontSize:13,fontWeight:700}}>⚠️ Connecting to Firebase…</div>}
      {view === "home"  && <HomeScreen setView={setView} />}
      {view === "order" && <OrderFlow menu={menu} currentServing={currentServing} onOrderPlaced={addOrder} onBack={() => setView("home")} />}
      {view === "stall" && <StallDashboard orders={orders} currentServing={currentServing} onAdvance={advanceQueue} onMarkDone={markOrderDone} onBack={() => setView("home")} />}
      {view === "admin" && <AdminPanel menu={menu} onUpdateMenu={updateMenu} onBack={() => setView("home")} />}
    </div>
  );
}

// ─── LOADING ──────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{...S.shell,justifyContent:"center",alignItems:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:64,animation:"pulse 1s infinite"}}>🍗</div>
      <div style={{color:"white",fontSize:18,fontWeight:700}}>Connecting to Firebase…</div>
      <div style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>Setting up your POS</div>
      <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}`}</style>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({ setView }) {
  return (
    <div style={{...S.shell,justifyContent:"center",alignItems:"center"}}>
      <div style={S.homeCard}>
        <div style={{fontSize:64,marginBottom:8}}>🍗</div>
        <div style={{fontSize:28,fontWeight:900,color:"#1a1a2e",letterSpacing:"-1px"}}>Uncle Lim's</div>
        <div style={{fontSize:14,color:"#999",fontWeight:600,marginBottom:4}}>Chicken Rice · Block A Canteen</div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:24}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#10b981"}}></div>
          <div style={{fontSize:12,color:"#10b981",fontWeight:700}}>Live · Firebase Connected</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
          <button style={{...S.homeBtn,background:"#c8102e"}} onClick={() => setView("order")}>🛒  Order Now (Student)</button>
          <button style={{...S.homeBtn,background:"#1a6b3c"}} onClick={() => setView("stall")}>🧑‍🍳  Stall Dashboard</button>
          <button style={{...S.homeBtn,background:"#1a1a2e"}} onClick={() => setView("admin")}>⚙️  Admin — Edit Menu</button>
        </div>
        <div style={{marginTop:20,fontSize:11,color:"#ccc",textAlign:"center",lineHeight:1.6}}>
          Share the Student link via QR code.<br/>Open Stall Dashboard on your tablet.
        </div>
      </div>
    </div>
  );
}

// ─── ORDER FLOW ───────────────────────────────────────────────────────────────
function OrderFlow({ menu, currentServing, onOrderPlaced, onBack }) {
  const [screen, setScreen] = useState("menu");
  const [cart, setCart] = useState({});
  const [note, setNote] = useState("");
  const [activeCategory, setActiveCategory] = useState(menu[0]?.id);
  const [payStep, setPayStep] = useState("qr");
  const [queueNum, setQueueNum] = useState(null);
  const [placing, setPlacing] = useState(false);

  const cartItems = Object.values(cart).filter(i => i.qty > 0);
  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const totalQty = cartItems.reduce((s, i) => s + i.qty, 0);

  function add(item) { setCart(p => ({ ...p, [item.id]: { ...item, qty: (p[item.id]?.qty||0)+1 } })); }
  function remove(id) {
    setCart(p => {
      const u = {...p};
      if (u[id]?.qty > 1) u[id] = {...u[id], qty: u[id].qty-1};
      else delete u[id];
      return u;
    });
  }

  async function simulatePay() {
    setPayStep("processing");
    await new Promise(r => setTimeout(r, 2000));
    setPayStep("done");
    await new Promise(r => setTimeout(r, 1000));
    const num = currentServing + Math.floor(Math.random()*8) + 1;
    setQueueNum(num);
    setPlacing(true);
    await onOrderPlaced({
      queueNum: num,
      items: cartItems.map(i => ({id:i.id,name:i.name,emoji:i.emoji,price:i.price,qty:i.qty})),
      note,
      total,
      time: new Date().toLocaleTimeString("en-MY", {hour:"2-digit",minute:"2-digit"}),
      status: "pending",
      timestamp: Date.now(),
    });
    setPlacing(false);
    setScreen("confirm");
  }

  function reset() { setCart({}); setNote(""); setQueueNum(null); setPayStep("qr"); setScreen("menu"); }
  const activeGroup = menu.find(g => g.id === activeCategory);

  return (
    <div style={S.shell}>
      <div style={S.phone}>
        {screen === "menu" && <>
          <div style={S.header}>
            <button style={S.backBtn} onClick={onBack}>←</button>
            <div style={{flex:1}}>
              <div style={S.stallName}>Uncle Lim's 🍗</div>
              <div style={S.stallSub}>Block A Canteen</div>
            </div>
          </div>
          <div style={S.tabs}>
            {menu.map(g => (
              <button key={g.id} style={{...S.tab,...(activeCategory===g.id?S.tabActive:{})}} onClick={()=>setActiveCategory(g.id)}>
                {g.category}
              </button>
            ))}
          </div>
          <div style={S.itemList}>
            {activeGroup?.items.map(item => {
              const qty = cart[item.id]?.qty||0;
              return (
                <div key={item.id} style={{...S.itemCard,opacity:item.outOfStock?0.5:1}}>
                  <div style={{fontSize:34,minWidth:44,textAlign:"center"}}>{item.emoji}</div>
                  <div style={{flex:1}}>
                    <div style={S.itemName}>{item.name} {item.outOfStock&&<span style={S.outBadge}>Out of stock</span>}</div>
                    <div style={S.itemDesc}>{item.desc}</div>
                    <div style={S.itemPrice}>RM {item.price.toFixed(2)}</div>
                  </div>
                  {!item.outOfStock && (
                    <div style={S.qtyCtrl}>
                      {qty>0&&<><button style={S.qtyBtn} onClick={()=>remove(item.id)}>−</button><span style={S.qtyNum}>{qty}</span></>}
                      <button style={S.addBtn} onClick={()=>add(item)}>+</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {totalQty>0&&(
            <button style={S.cartBar} onClick={()=>setScreen("cart")}>
              <span style={S.cartBadge}>{totalQty}</span>
              <span>View Order</span>
              <span>RM {total.toFixed(2)}</span>
            </button>
          )}
        </>}

        {screen === "cart" && <>
          <div style={S.header}>
            <button style={S.backBtn} onClick={()=>setScreen("menu")}>←</button>
            <div style={S.headerTitle}>Your Order</div>
          </div>
          <div style={S.itemList}>
            {cartItems.map(item=>(
              <div key={item.id} style={S.cartRow}>
                <div style={{fontSize:28}}>{item.emoji}</div>
                <div style={{flex:1}}>
                  <div style={S.itemName}>{item.name}</div>
                  <div style={S.itemPrice}>RM {item.price.toFixed(2)}</div>
                </div>
                <div style={S.qtyCtrl}>
                  <button style={S.qtyBtn} onClick={()=>remove(item.id)}>−</button>
                  <span style={S.qtyNum}>{item.qty}</span>
                  <button style={S.addBtn} onClick={()=>add(item)}>+</button>
                </div>
              </div>
            ))}
            <div style={S.noteBox}>
              <div style={{fontSize:12,fontWeight:600,color:"#999",marginBottom:8}}>Special requests</div>
              <textarea style={S.noteInput} placeholder="e.g. less rice, no chilli…" value={note} onChange={e=>setNote(e.target.value)} rows={3}/>
            </div>
          </div>
          <div style={S.cartFooter}>
            <div style={S.totalRow}><span>Total</span><span style={S.totalAmt}>RM {total.toFixed(2)}</span></div>
            <button style={{...S.bigBtn,background:"#0066cc"}} onClick={()=>setScreen("payment")}>Pay with TNG eWallet →</button>
          </div>
        </>}

        {screen === "payment" && <>
          <div style={S.header}>
            {payStep==="qr"&&<button style={S.backBtn} onClick={()=>setScreen("cart")}>←</button>}
            <div style={S.headerTitle}>Payment</div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",gap:16}}>
            {payStep==="qr"&&<>
              <div style={{fontSize:18,fontWeight:800,color:"#0066cc",background:"#e8f0fe",padding:"10px 20px",borderRadius:12}}>💙 Touch 'n Go eWallet</div>
              <div style={{fontSize:13,color:"#999",fontWeight:600}}>Amount to pay</div>
              <div style={{fontSize:40,fontWeight:900,color:"#1a1a2e"}}>RM {total.toFixed(2)}</div>
              <div style={{background:"white",borderRadius:20,padding:20,boxShadow:"0 4px 24px rgba(0,0,0,0.1)",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <FakeQR/><div style={{fontSize:12,color:"#999",fontWeight:600}}>Scan with TNG eWallet app</div>
              </div>
              <button style={{...S.bigBtn,background:"#0066cc",width:"100%"}} onClick={simulatePay}>✓ Simulate Payment (Demo)</button>
              <div style={{fontSize:11,color:"#bbb",textAlign:"center"}}>* Real TNG integration requires merchant account</div>
            </>}
            {payStep==="processing"&&<div style={{textAlign:"center"}}><div style={{fontSize:56}}>⏳</div><div style={{fontSize:20,fontWeight:700,marginTop:16,color:"#333"}}>Processing payment…</div></div>}
            {payStep==="done"&&<div style={{textAlign:"center"}}><div style={{fontSize:64}}>✅</div><div style={{fontSize:20,fontWeight:700,marginTop:16,color:"#333"}}>{placing?"Placing order…":"Payment successful!"}</div></div>}
          </div>
        </>}

        {screen==="confirm"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",textAlign:"center",gap:12,background:"#f9f5f0"}}>
            <div style={{fontSize:64}}>🎉</div>
            <div style={{fontSize:28,fontWeight:900,color:"#1a1a2e"}}>Order Placed!</div>
            <div style={{fontSize:14,color:"#999",fontWeight:600}}>Your queue number is</div>
            <div style={{fontSize:96,fontWeight:900,color:"#c8102e",lineHeight:1,letterSpacing:"-4px"}}>{queueNum}</div>
            <div style={{fontSize:14,color:"#666",lineHeight:1.6,maxWidth:280}}>We'll call your number when your food is ready! 🍗</div>
            <div style={{background:"#fff3cd",color:"#856404",padding:"10px 20px",borderRadius:12,fontSize:14,fontWeight:600}}>Now serving: <strong>#{currentServing}</strong></div>
            <button style={{...S.bigBtn,background:"#c8102e",marginTop:8,width:"auto",padding:"14px 40px"}} onClick={reset}>Order Again</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function FakeQR() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <rect width="160" height="160" fill="white"/>
      {[...Array(10)].map((_,r)=>[...Array(10)].map((_,c)=>{
        const dark=(r+c+r*c)%3!==0;
        return dark?<rect key={`${r}-${c}`} x={10+c*14} y={10+r*14} width={12} height={12} fill="#1a1a2e" rx={1}/>:null;
      }))}
      {[[10,10],[108,10],[10,108]].map(([x,y],i)=>(
        <g key={i}>
          <rect x={x} y={y} width={42} height={42} fill="#1a1a2e" rx={4}/>
          <rect x={x+6} y={y+6} width={30} height={30} fill="white" rx={2}/>
          <rect x={x+12} y={y+12} width={18} height={18} fill="#1a1a2e" rx={2}/>
        </g>
      ))}
    </svg>
  );
}

// ─── STALL DASHBOARD ──────────────────────────────────────────────────────────
function StallDashboard({ orders, currentServing, onAdvance, onMarkDone, onBack }) {
  const pending = orders.filter(o => o.status==="pending");
  const done = orders.filter(o => o.status==="done");
  const todayRevenue = done.reduce((s,o) => s+o.total, 0);
  const [newOrder, setNewOrder] = useState(false);
  const prevPending = useRef(pending.length);

  useEffect(() => {
    if (pending.length > prevPending.current) {
      setNewOrder(true);
      setTimeout(()=>setNewOrder(false), 3000);
    }
    prevPending.current = pending.length;
  }, [pending.length]);

  return (
    <div style={{minHeight:"100vh",background:"#0f1117",fontFamily:"'Segoe UI',sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`@keyframes flash{0%,100%{background:#1e2130}50%{background:#1a3a1a}}`}</style>

      {newOrder && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:999,background:"#10b981",color:"white",padding:"14px",textAlign:"center",fontSize:16,fontWeight:800,animation:"flash 0.5s 3"}}>
          🔔 New Order Received!
        </div>
      )}

      <div style={{background:"#1a1a2e",padding:"16px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:"3px solid #c8102e"}}>
        <button style={{background:"rgba(255,255,255,0.1)",border:"none",color:"white",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}} onClick={onBack}>← Back</button>
        <div style={{flex:1}}>
          <div style={{color:"white",fontSize:20,fontWeight:900}}>🧑‍🍳 Stall Dashboard</div>
          <div style={{color:"#aaa",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#10b981"}}></div>
            Live · Uncle Lim's Chicken Rice
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:"#aaa",fontSize:11,fontWeight:600}}>NOW SERVING</div>
          <div style={{color:"#c8102e",fontSize:32,fontWeight:900,lineHeight:1}}>#{currentServing}</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,padding:"14px",background:"#16181f"}}>
        {[
          {label:"Pending",value:pending.length,color:"#f59e0b",bg:"#2a2200"},
          {label:"Completed",value:done.length,color:"#10b981",bg:"#0a2a1a"},
          {label:"Revenue",value:`RM${todayRevenue.toFixed(2)}`,color:"#3b82f6",bg:"#0a1a3a"},
        ].map(s=>(
          <div key={s.label} style={{background:s.bg,borderRadius:12,padding:"14px 10px",textAlign:"center",border:`1px solid ${s.color}22`}}>
            <div style={{color:s.color,fontSize:s.label==="Revenue"?16:24,fontWeight:900}}>{s.value}</div>
            <div style={{color:"#666",fontSize:11,fontWeight:600,marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Call next */}
      <div style={{padding:"0 14px 14px"}}>
        <button style={{width:"100%",background:"#c8102e",color:"white",border:"none",borderRadius:14,padding:"16px",fontSize:16,fontWeight:800,cursor:"pointer"}} onClick={onAdvance}>
          📣 Call Next — #{currentServing+1}
        </button>
      </div>

      {/* Orders */}
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:10}}>
        {pending.length===0&&(
          <div style={{textAlign:"center",color:"#444",padding:"40px 0",fontSize:15}}>No pending orders 🎉<br/><span style={{fontSize:13,color:"#333"}}>Waiting for students to order…</span></div>
        )}
        {pending.map(order=>(
          <div key={order.fbKey} style={{background:"#1e2130",borderRadius:16,padding:"16px",border:"1px solid #f59e0b44"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <div style={{color:"white",fontWeight:900,fontSize:20}}>Queue <span style={{color:"#f59e0b"}}>#{order.queueNum}</span></div>
                <div style={{color:"#555",fontSize:12}}>{order.time}</div>
              </div>
              <div style={{color:"#10b981",fontWeight:800,fontSize:18}}>RM {order.total.toFixed(2)}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
              {order.items.map((item,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",color:"#ccc",fontSize:14}}>
                  <span>{item.emoji} {item.name}</span>
                  <span style={{color:"#888"}}>×{item.qty}</span>
                </div>
              ))}
            </div>
            {order.note&&<div style={{background:"#2a2d3e",borderRadius:8,padding:"8px 12px",color:"#f59e0b",fontSize:12,marginBottom:10}}>📝 {order.note}</div>}
            <button style={{width:"100%",background:"#10b981",color:"white",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}} onClick={()=>onMarkDone(order.fbKey)}>
              ✓ Mark as Ready — Call #{order.queueNum}
            </button>
          </div>
        ))}

        {done.length>0&&<>
          <div style={{color:"#333",fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",marginTop:8}}>Completed Today</div>
          {[...done].reverse().map(order=>(
            <div key={order.fbKey} style={{background:"#161820",borderRadius:12,padding:"12px 14px",border:"1px solid #1e2130",opacity:0.55}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{color:"#555",fontWeight:700}}>#{order.queueNum} · {order.time}</div>
                <div style={{color:"#10b981",fontSize:12,fontWeight:700}}>✓ RM {order.total.toFixed(2)}</div>
              </div>
              <div style={{color:"#3a3a4a",fontSize:12,marginTop:3}}>{order.items.map(i=>`${i.emoji}${i.name}`).join(", ")}</div>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({ menu, onUpdateMenu, onBack }) {
  const [activeCategory, setActiveCategory] = useState(menu[0]?.id);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [saved, setSaved] = useState(false);

  const activeGroup = menu.find(g=>g.id===activeCategory);
  function showSaved() { setSaved(true); setTimeout(()=>setSaved(false),2000); }

  function toggleStock(catId,itemId) {
    onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:g.items.map(i=>i.id===itemId?{...i,outOfStock:!i.outOfStock}:i)}:g));
    showSaved();
  }
  function deleteItem(catId,itemId) {
    onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:g.items.filter(i=>i.id!==itemId)}:g));
    showSaved();
  }
  function saveEdit(catId,updatedItem) {
    onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:g.items.map(i=>i.id===updatedItem.id?updatedItem:i)}:g));
    setEditing(null); showSaved();
  }
  function addItem(catId,item) {
    onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:[...g.items,{...item,id:genId(),outOfStock:false}]}:g));
    setAdding(false); showSaved();
  }
  function addCategory() {
    if(!newCatName.trim()) return;
    onUpdateMenu([...menu,{id:genId(),category:newCatName.trim(),items:[]}]);
    setNewCatName(""); setAddingCat(false); showSaved();
  }
  function deleteCategory(catId) {
    if(menu.length<=1) return;
    const updated=menu.filter(g=>g.id!==catId);
    onUpdateMenu(updated); setActiveCategory(updated[0].id); showSaved();
  }

  return (
    <div style={{minHeight:"100vh",background:"#f4f1ec",fontFamily:"'Segoe UI',sans-serif",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#1a1a2e",padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
        <button style={{background:"rgba(255,255,255,0.1)",border:"none",color:"white",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}} onClick={onBack}>← Back</button>
        <div style={{flex:1,color:"white",fontSize:18,fontWeight:900}}>⚙️ Menu Manager</div>
        {saved&&<div style={{background:"#10b981",color:"white",borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:700}}>✓ Saved to Firebase!</div>}
      </div>

      <div style={{background:"white",borderBottom:"2px solid #e8e0d5",padding:"0 12px",display:"flex",alignItems:"center",overflowX:"auto",gap:4}}>
        {menu.map(g=>(
          <button key={g.id} style={{...S.tab,...(activeCategory===g.id?{...S.tabActive,color:"#1a1a2e",borderColor:"#1a1a2e"}:{})}} onClick={()=>setActiveCategory(g.id)}>
            {g.category}
          </button>
        ))}
        {addingCat?(
          <div style={{display:"flex",gap:6,padding:"8px 0",alignItems:"center"}}>
            <input autoFocus style={{border:"1.5px solid #ccc",borderRadius:8,padding:"6px 10px",fontSize:13,outline:"none",width:120}} placeholder="Category name" value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()}/>
            <button style={S.greenBtn} onClick={addCategory}>Add</button>
            <button style={S.ghostBtn} onClick={()=>{setAddingCat(false);setNewCatName("");}}>✕</button>
          </div>
        ):(
          <button style={{...S.tab,color:"#10b981",fontWeight:700,whiteSpace:"nowrap"}} onClick={()=>setAddingCat(true)}>+ Category</button>
        )}
      </div>

      {menu.length>1&&(
        <div style={{padding:"10px 16px 0",display:"flex",justifyContent:"flex-end"}}>
          <button style={{...S.ghostBtn,color:"#ef4444",borderColor:"#ef4444",fontSize:12}} onClick={()=>deleteCategory(activeCategory)}>🗑 Delete "{activeGroup?.category}"</button>
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {activeGroup?.items.map(item=>(
          editing?.id===item.id?(
            <EditForm key={item.id} item={item} catId={activeCategory} onSave={saveEdit} onCancel={()=>setEditing(null)}/>
          ):(
            <div key={item.id} style={{background:"white",borderRadius:14,padding:"14px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",border:item.outOfStock?"2px dashed #fca5a5":"2px solid transparent"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:30}}>{item.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:item.outOfStock?"#aaa":"#1a1a2e",fontSize:14}}>
                    {item.name} {item.outOfStock&&<span style={S.outBadge}>Out of stock</span>}
                  </div>
                  <div style={{color:"#999",fontSize:12}}>{item.desc}</div>
                  <div style={{color:"#c8102e",fontWeight:800,fontSize:14,marginTop:2}}>RM {item.price.toFixed(2)}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button style={{...S.ghostBtn,flex:1}} onClick={()=>setEditing(item)}>✏️ Edit</button>
                <button style={{...S.ghostBtn,flex:1,color:item.outOfStock?"#10b981":"#f59e0b",borderColor:item.outOfStock?"#10b981":"#f59e0b"}} onClick={()=>toggleStock(activeCategory,item.id)}>
                  {item.outOfStock?"✓ Back in Stock":"⊘ Out of Stock"}
                </button>
                <button style={{...S.ghostBtn,color:"#ef4444",borderColor:"#ef4444",padding:"8px 12px"}} onClick={()=>deleteItem(activeCategory,item.id)}>🗑</button>
              </div>
            </div>
          )
        ))}
        {adding?(
          <EditForm catId={activeCategory} isNew onSave={addItem} onCancel={()=>setAdding(false)}/>
        ):(
          <button style={{background:"#1a1a2e",color:"white",border:"none",borderRadius:14,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer"}} onClick={()=>setAdding(true)}>
            + Add New Item
          </button>
        )}
      </div>
    </div>
  );
}

function EditForm({ item, catId, onSave, onCancel, isNew }) {
  const [form, setForm] = useState(item||{name:"",desc:"",price:"",emoji:"🍗"});
  const [showEmoji, setShowEmoji] = useState(false);
  function set(k,v) { setForm(p=>({...p,[k]:v})); }
  function handleSave() {
    if(!form.name.trim()||!form.price) return;
    onSave(catId,{...form,price:parseFloat(form.price)});
  }
  return (
    <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 4px 16px rgba(0,0,0,0.12)",border:"2px solid #1a1a2e"}}>
      <div style={{fontWeight:800,fontSize:15,marginBottom:14,color:"#1a1a2e"}}>{isNew?"New Item":"Edit Item"}</div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:6}}>Icon</div>
        <button style={{fontSize:32,background:"#f4f1ec",border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer"}} onClick={()=>setShowEmoji(p=>!p)}>{form.emoji}</button>
        {showEmoji&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8,background:"#f4f1ec",borderRadius:10,padding:8}}>
            {EMOJIS.map(e=>(
              <button key={e} style={{fontSize:24,background:"none",border:"none",cursor:"pointer",borderRadius:6,padding:4}} onClick={()=>{set("emoji",e);setShowEmoji(false);}}>{e}</button>
            ))}
          </div>
        )}
      </div>
      <Field label="Item name" value={form.name} onChange={v=>set("name",v)} placeholder="e.g. Roasted Chicken Rice"/>
      <Field label="Description" value={form.desc} onChange={v=>set("desc",v)} placeholder="e.g. Fragrant rice with roasted chicken"/>
      <Field label="Price (RM)" value={form.price} onChange={v=>set("price",v)} placeholder="e.g. 3.50" type="number"/>
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <button style={{...S.greenBtn,flex:1,padding:"12px"}} onClick={handleSave}>{isNew?"Add Item":"Save Changes"}</button>
        <button style={{...S.ghostBtn,padding:"12px 20px"}} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Field({label,value,onChange,placeholder,type="text"}) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:4}}>{label}</div>
      <input type={type} style={{width:"100%",border:"1.5px solid #e0d9d0",borderRadius:8,padding:"10px",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>
    </div>
  );
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const S = {
  shell:{minHeight:"100vh",background:"linear-gradient(135deg,#c8102e 0%,#8b0000 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:"20px"},
  phone:{width:"100%",maxWidth:420,background:"#f9f5f0",borderRadius:32,overflow:"hidden",boxShadow:"0 30px 80px rgba(0,0,0,0.4)",minHeight:700,display:"flex",flexDirection:"column"},
  header:{background:"#c8102e",padding:"20px 16px 16px",color:"white",display:"flex",alignItems:"center",gap:12},
  stallName:{fontSize:20,fontWeight:800,letterSpacing:"-0.3px"},
  stallSub:{fontSize:12,opacity:0.8,marginTop:2},
  headerTitle:{fontSize:18,fontWeight:700,flex:1,textAlign:"center",color:"white"},
  backBtn:{background:"rgba(255,255,255,0.2)",border:"none",color:"white",borderRadius:20,padding:"6px 14px",fontSize:16,cursor:"pointer",fontWeight:600},
  tabs:{display:"flex",background:"#fff",borderBottom:"2px solid #f0e8df",padding:"0 8px",overflowX:"auto"},
  tab:{flex:1,padding:"12px 4px",border:"none",background:"none",fontSize:12,fontWeight:600,color:"#999",cursor:"pointer",borderBottom:"3px solid transparent",whiteSpace:"nowrap"},
  tabActive:{color:"#c8102e",borderBottom:"3px solid #c8102e"},
  itemList:{flex:1,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:10},
  itemCard:{background:"white",borderRadius:16,padding:"14px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},
  itemName:{fontSize:14,fontWeight:700,color:"#1a1a2e",marginBottom:2},
  itemDesc:{fontSize:11,color:"#999",marginBottom:4},
  itemPrice:{fontSize:14,fontWeight:700,color:"#c8102e"},
  outBadge:{marginLeft:6,background:"#fee2e2",color:"#ef4444",borderRadius:6,padding:"2px 6px",fontSize:10,fontWeight:700},
  qtyCtrl:{display:"flex",alignItems:"center",gap:6},
  qtyBtn:{width:28,height:28,borderRadius:14,border:"2px solid #c8102e",background:"white",color:"#c8102e",fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  addBtn:{width:32,height:32,borderRadius:16,border:"none",background:"#c8102e",color:"white",fontSize:20,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  qtyNum:{fontSize:15,fontWeight:700,minWidth:16,textAlign:"center"},
  cartBar:{margin:"12px",background:"#c8102e",color:"white",border:"none",borderRadius:16,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(200,16,46,0.4)"},
  cartBadge:{background:"white",color:"#c8102e",borderRadius:12,width:24,height:24,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800},
  cartRow:{background:"white",borderRadius:14,padding:"12px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},
  noteBox:{background:"white",borderRadius:14,padding:"14px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},
  noteInput:{width:"100%",border:"1.5px solid #eee",borderRadius:10,padding:"10px",fontSize:13,fontFamily:"inherit",resize:"none",color:"#333",outline:"none",boxSizing:"border-box"},
  cartFooter:{background:"white",padding:"16px",borderTop:"2px solid #f0e8df"},
  totalRow:{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:600,color:"#555",marginBottom:12},
  totalAmt:{color:"#1a1a2e",fontSize:20,fontWeight:800},
  bigBtn:{width:"100%",color:"white",border:"none",borderRadius:14,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer"},
  homeCard:{background:"white",borderRadius:28,padding:"36px 28px",width:"100%",maxWidth:360,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",alignItems:"center"},
  homeBtn:{color:"white",border:"none",borderRadius:14,padding:"16px 20px",fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:12,width:"100%"},
  greenBtn:{background:"#10b981",color:"white",border:"none",borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"},
  ghostBtn:{background:"none",color:"#555",border:"1.5px solid #ddd",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"},
};