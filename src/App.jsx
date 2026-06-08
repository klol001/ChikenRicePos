import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, push, update } from "firebase/database";

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

const SESSION_MINUTES = 60;

const DEFAULT_MENU = [
  { id:1, category:"Chicken Rice", items:[
    { id:101, name:"Roasted Chicken Rice", price:3.50, emoji:"🍗", desc:"Fragrant rice with roasted chicken", outOfStock:false },
    { id:102, name:"Steamed Chicken Rice",  price:3.50, emoji:"🍚", desc:"Tender steamed chicken with ginger rice", outOfStock:false },
    { id:103, name:"Mixed Chicken Rice",    price:4.00, emoji:"🍱", desc:"Half roasted, half steamed", outOfStock:false },
  ]},
  { id:2, category:"Add-ons", items:[
    { id:201, name:"Extra Chicken", price:2.00, emoji:"🍗", desc:"Additional chicken portion", outOfStock:false },
    { id:202, name:"Extra Rice",    price:0.50, emoji:"🍚", desc:"An extra scoop of rice",    outOfStock:false },
    { id:203, name:"Braised Egg",   price:0.80, emoji:"🥚", desc:"Slow-cooked soy braised egg", outOfStock:false },
    { id:204, name:"Chilli Sauce",  price:0.20, emoji:"🌶️", desc:"Signature house chilli",   outOfStock:false },
  ]},
  { id:3, category:"Drinks", items:[
    { id:301, name:"Barley Water",      price:1.20, emoji:"🥤", desc:"Refreshing cold barley", outOfStock:false },
    { id:302, name:"Chrysanthemum Tea", price:1.20, emoji:"🍵", desc:"Light and floral",       outOfStock:false },
    { id:303, name:"Plain Water",       price:0.50, emoji:"💧", desc:"Chilled mineral water",  outOfStock:false },
  ]},
];

const DEFAULT_HOURS = { open:"07:00", close:"15:00", days:[1,2,3,4,5], manualOpen:null };

const DEFAULT_BRANDING = {
  stallName: "Uncle Lim's",
  tagline: "Block A Canteen · Self Order",
  primaryColor: "#c8102e",
};

const DEFAULT_SETTINGS = {
  stallPassword: "unclelim123",
  adminPassword: "admin888",
};

const EMOJIS = ["🍗","🍚","🍱","🥚","🌶️","🥤","🍵","💧","🍜","🥩","🧆","🫙","🧃","🥗","🍲","🫕","🧋","☕"];
const COLORS = ["#c8102e","#e85d04","#2d6a4f","#1d3557","#7b2d8b","#b5451b","#0077b6","#333333"];
let nextId = 500;
function genId() { return nextId++; }

function isWithinHours(hours) {
  if (hours.manualOpen === true) return true;
  if (hours.manualOpen === false) return false;
  const now = new Date();
  const day = now.getDay();
  if (!hours.days.includes(day)) return false;
  const hhmm = now.getHours()*60 + now.getMinutes();
  const [oh,om] = hours.open.split(":").map(Number);
  const [ch,cm] = hours.close.split(":").map(Number);
  return hhmm >= oh*60+om && hhmm < ch*60+cm;
}

function formatTime(secs) {
  const m = Math.floor(secs/60).toString().padStart(2,"0");
  const s = (secs%60).toString().padStart(2,"0");
  return `${m}:${s}`;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0,150,300].forEach(delay => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.3);
      }, delay);
    });
  } catch(e) {}
}

async function fbGet(path, fallback) {
  try { const s = await get(ref(db,path)); return s.exists() ? s.val() : fallback; } catch { return fallback; }
}
async function fbSet(path, val) { try { await set(ref(db,path), val); } catch(e) { console.error(e); } }
async function fbPush(path, val) { try { await push(ref(db,path), val); } catch(e) { console.error(e); } }
async function fbUpdate(path, val) { try { await update(ref(db,path), val); } catch(e) { console.error(e); } }

function useFirebaseState() {
  const [menu, setMenu] = useState(null);
  const [orders, setOrders] = useState([]);
  const [currentServing, setCurrentServing] = useState(40);
  const [hours, setHours] = useState(null);
  const [branding, setBranding] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    // Initial loads
    fbGet("menu", null).then(m => { if(m) setMenu(m); else { setMenu(DEFAULT_MENU); fbSet("menu", DEFAULT_MENU); } });
    fbGet("hours", DEFAULT_HOURS).then(h => setHours(h));
    fbGet("branding", DEFAULT_BRANDING).then(b => setBranding(b));
    fbGet("settings", DEFAULT_SETTINGS).then(s => setSettings(s));

    // Real-time listeners
    const unsubQ = onValue(ref(db,"currentServing"), s => { if(s.exists()) setCurrentServing(s.val()); });
    const unsubO = onValue(ref(db,"orders"), s => {
      if(s.exists()) { const arr = Object.entries(s.val()).map(([k,v])=>({...v,fbKey:k})); arr.sort((a,b)=>a.timestamp-b.timestamp); setOrders(arr); }
      else setOrders([]);
    });
    const unsubH = onValue(ref(db,"hours"), s => { if(s.exists()) setHours(s.val()); });
    // ✅ Real-time menu listener — fixes out-of-stock not updating instantly
    const unsubM = onValue(ref(db,"menu"), s => { if(s.exists()) setMenu(s.val()); });
    const unsubB = onValue(ref(db,"branding"), s => { if(s.exists()) setBranding(s.val()); });

    return () => { unsubQ(); unsubO(); unsubH(); unsubM(); unsubB(); };
  }, []);

  const updateMenu     = useCallback(async m => { await fbSet("menu",m); }, []);
  const updateHours    = useCallback(async h => { setHours(h); await fbSet("hours",h); }, []);
  const updateBranding = useCallback(async b => { setBranding(b); await fbSet("branding",b); }, []);
  const updateSettings = useCallback(async s => { setSettings(s); await fbSet("settings",s); }, []);
  const addOrder       = useCallback(async o => { await fbPush("orders",o); }, []);
  const markDone       = useCallback(async k => { await fbUpdate(`orders/${k}`,{status:"done"}); }, []);
  const advanceQueue   = useCallback(async () => { setCurrentServing(p => { const n=p+1; fbSet("currentServing",n); return n; }); }, []);

  return { menu, orders, currentServing, hours, branding, settings, updateMenu, updateHours, updateBranding, updateSettings, addOrder, markDone, advanceQueue };
}

function PasswordGate({ correctPassword, label, icon, children }) {
  const [input, setInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function attempt() {
    if (input === correctPassword) { setUnlocked(true); }
    else { setError(true); setShake(true); setInput(""); setTimeout(()=>setShake(false),500); setTimeout(()=>setError(false),2000); }
  }

  if (unlocked) return children;
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a1a2e,#16213e)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:20}}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
      <div style={{background:"#1e2130",borderRadius:24,padding:"40px 32px",width:"100%",maxWidth:360,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",animation:shake?"shake 0.4s ease":"none"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:52,marginBottom:12}}>{icon}</div>
          <div style={{color:"white",fontSize:22,fontWeight:900}}>{label}</div>
          <div style={{color:"#666",fontSize:13,marginTop:6}}>Enter password to continue</div>
        </div>
        <input type="password" placeholder="Password" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&attempt()} autoFocus
          style={{width:"100%",background:"#2a2d3e",border:error?"2px solid #ef4444":"2px solid #3a3d4e",borderRadius:12,padding:"14px 16px",fontSize:16,color:"white",outline:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:12}}/>
        {error&&<div style={{color:"#ef4444",fontSize:13,textAlign:"center",marginBottom:12,fontWeight:600}}>❌ Wrong password</div>}
        <button onClick={attempt} style={{width:"100%",background:"#c8102e",color:"white",border:"none",borderRadius:12,padding:"15px",fontSize:15,fontWeight:700,cursor:"pointer"}}>Unlock →</button>
        <div style={{textAlign:"center",marginTop:20}}><a href="/" style={{color:"#444",fontSize:12,textDecoration:"none"}}>← Back to ordering</a></div>
      </div>
    </div>
  );
}

// PasswordGate that reads password from Firebase settings
function DynamicPasswordGate({ passwordKey, label, icon, settings, children }) {
  if (!settings) return <LoadingScreen />;
  return (
    <PasswordGate correctPassword={settings[passwordKey]} label={label} icon={icon}>
      {children}
    </PasswordGate>
  );
}

export default function App() {
  const state = useFirebaseState();
  if (!state.menu || !state.hours || !state.branding || !state.settings) return <LoadingScreen />;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OrderGate state={state} />} />
        <Route path="/stall" element={
          <DynamicPasswordGate passwordKey="stallPassword" label="Stall Dashboard" icon="🧑‍🍳" settings={state.settings}>
            <StallDashboard {...state} />
          </DynamicPasswordGate>
        } />
        <Route path="/admin" element={
          <DynamicPasswordGate passwordKey="adminPassword" label="Admin Panel" icon="⚙️" settings={state.settings}>
            <AdminPanel {...state} />
          </DynamicPasswordGate>
        } />
        <Route path="/qr" element={<QRPage branding={state.branding} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function LoadingScreen() {
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#c8102e,#8b0000)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,fontFamily:"'Segoe UI',sans-serif"}}>
      <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}`}</style>
      <div style={{fontSize:64,animation:"pulse 1s infinite"}}>🍗</div>
      <div style={{color:"white",fontSize:18,fontWeight:700}}>Loading…</div>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{minHeight:"100vh",background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{fontSize:64}}>🍗</div>
      <div style={{color:"white",fontSize:24,fontWeight:900}}>Page not found</div>
      <a href="/" style={{color:"#c8102e",fontSize:15,fontWeight:600}}>← Go to ordering</a>
    </div>
  );
}

function QRPage({ branding }) {
  const url = window.location.origin;
  const color = branding?.primaryColor || "#c8102e";
  return (
    <div style={{minHeight:"100vh",background:"white",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:40,gap:24}}>
      <div style={{fontSize:48}}>🍗</div>
      <div style={{fontSize:28,fontWeight:900,color:"#1a1a2e"}}>{branding?.stallName || "Uncle Lim's"}</div>
      <div style={{fontSize:16,color:"#666",fontWeight:600}}>Scan to Order</div>
      <div style={{background:"white",padding:20,borderRadius:20,boxShadow:"0 4px 40px rgba(0,0,0,0.12)",border:`3px solid ${color}`}}>
        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`} alt="QR Code" style={{width:260,height:260,display:"block"}}/>
      </div>
      <div style={{fontSize:14,color:"#999",textAlign:"center",maxWidth:280,lineHeight:1.7}}>
        Point your phone camera at this QR code to start ordering.<br/>
        <strong style={{color}}>Session expires after {SESSION_MINUTES} minutes.</strong>
      </div>
      <div style={{background:"#f4f1ec",borderRadius:12,padding:"10px 20px",fontSize:13,color:"#666"}}>{url}</div>
      <button onClick={()=>window.print()} style={{background:"#1a1a2e",color:"white",border:"none",borderRadius:12,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer"}}>🖨️ Print this QR</button>
      <style>{`@media print { button { display:none; } }`}</style>
    </div>
  );
}

function OrderGate({ state }) {
  const { hours, menu, currentServing, addOrder, branding } = state;
  const [sessionState, setSessionState] = useState("checking");
  const [secondsLeft, setSecondsLeft] = useState(SESSION_MINUTES*60);

  useEffect(() => {
    if (!hours) return;
    if (isWithinHours(hours)) { setSessionState("open"); setSecondsLeft(SESSION_MINUTES*60); }
    else setSessionState("closed");
  }, [hours]);

  useEffect(() => {
    if (sessionState !== "open") return;
    const t = setInterval(() => {
      setSecondsLeft(prev => { if(prev<=1){ clearInterval(t); setSessionState("expired"); return 0; } return prev-1; });
    }, 1000);
    return () => clearInterval(t);
  }, [sessionState]);

  if (sessionState==="checking") return <LoadingScreen />;
  if (sessionState==="closed")   return <ClosedScreen hours={hours} branding={branding} />;
  if (sessionState==="expired")  return <ExpiredScreen />;
  return <OrderFlow menu={menu} currentServing={currentServing} addOrder={addOrder} secondsLeft={secondsLeft} branding={branding} />;
}

function ClosedScreen({ hours, branding }) {
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const days = hours.days.map(d=>dayNames[d]).join(", ");
  const color = branding?.primaryColor || "#c8102e";
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a1a2e,#16213e)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:20}}>
      <div style={{textAlign:"center",maxWidth:340}}>
        <div style={{fontSize:80,marginBottom:16}}>🔒</div>
        <div style={{color:"white",fontSize:26,fontWeight:900,marginBottom:8}}>{branding?.stallName || "Canteen"} Closed</div>
        <div style={{color:"#666",fontSize:15,lineHeight:1.7,marginBottom:24}}>We're currently closed.<br/>Come back during operating hours!</div>
        <div style={{background:"#1e2130",borderRadius:16,padding:"20px 24px",border:"1px solid #2a2d3e"}}>
          <div style={{color:"#f59e0b",fontWeight:700,fontSize:13,marginBottom:12,textTransform:"uppercase",letterSpacing:"1px"}}>Operating Hours</div>
          <div style={{color:"white",fontSize:18,fontWeight:800}}>{hours.open} – {hours.close}</div>
          <div style={{color:"#666",fontSize:13,marginTop:6}}>{days}</div>
        </div>
      </div>
    </div>
  );
}

function ExpiredScreen() {
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a1a2e,#16213e)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:20}}>
      <div style={{textAlign:"center",maxWidth:320}}>
        <div style={{fontSize:80,marginBottom:16}}>⏰</div>
        <div style={{color:"white",fontSize:26,fontWeight:900,marginBottom:8}}>Session Expired</div>
        <div style={{color:"#666",fontSize:15,lineHeight:1.7,marginBottom:28}}>Your {SESSION_MINUTES}-minute ordering session has ended.<br/>Please scan the QR code again to order.</div>
        <div style={{background:"#1e2130",borderRadius:16,padding:"16px 20px",border:"1px solid #c8102e44"}}>
          <div style={{color:"#c8102e",fontSize:13,fontWeight:700}}>📱 Scan the QR code at the stall to start a new session</div>
        </div>
      </div>
    </div>
  );
}

function OrderFlow({ menu, currentServing, addOrder, secondsLeft, branding }) {
  const [screen, setScreen] = useState("menu");
  const [cart, setCart] = useState({});
  const [note, setNote] = useState("");
  const [activeCategory, setActiveCategory] = useState(menu[0]?.id);
  const [payStep, setPayStep] = useState("qr");
  const [queueNum, setQueueNum] = useState(null);
  const [placing, setPlacing] = useState(false);

  const color = branding?.primaryColor || "#c8102e";
  const cartItems = Object.values(cart).filter(i=>i.qty>0);
  const total = cartItems.reduce((s,i)=>s+i.price*i.qty, 0);
  const totalQty = cartItems.reduce((s,i)=>s+i.qty, 0);
  const isLow = secondsLeft <= 300;

  function add(item) {
    // ✅ Don't allow adding if now out of stock
    if (item.outOfStock) return;
    setCart(p=>({...p,[item.id]:{...item,qty:(p[item.id]?.qty||0)+1}}));
  }
  function remove(id) { setCart(p=>{ const u={...p}; if(u[id]?.qty>1) u[id]={...u[id],qty:u[id].qty-1}; else delete u[id]; return u; }); }

  // ✅ When menu updates, remove out-of-stock items from cart
  useEffect(() => {
    if (!menu) return;
    const allItems = menu.flatMap(g=>g.items);
    setCart(prev => {
      const updated = {...prev};
      Object.keys(updated).forEach(id => {
        const item = allItems.find(i=>String(i.id)===String(id));
        if (item?.outOfStock) delete updated[id];
      });
      return updated;
    });
  }, [menu]);

  async function simulatePay() {
    setPayStep("processing");
    await new Promise(r=>setTimeout(r,2000));
    setPayStep("done");
    await new Promise(r=>setTimeout(r,1000));
    const num = currentServing + Math.floor(Math.random()*8) + 1;
    setQueueNum(num); setPlacing(true);
    await addOrder({ queueNum:num, items:cartItems.map(i=>({id:i.id,name:i.name,emoji:i.emoji,price:i.price,qty:i.qty})), note, total, time:new Date().toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"}), status:"pending", timestamp:Date.now() });
    setPlacing(false); setScreen("confirm");
  }

  function reset() { setCart({}); setNote(""); setQueueNum(null); setPayStep("qr"); setScreen("menu"); }
  const activeGroup = menu.find(g=>g.id===activeCategory);

  return (
    <div style={{...S.shell, background:`linear-gradient(135deg,${color} 0%,${color}99 100%)`}}>
      <div style={S.phone}>
        <div style={{background:isLow?"#ef4444":"#1a1a2e",padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:isLow?"white":"#666",fontSize:12,fontWeight:600}}>{isLow?"⚠️ Session ending soon!":"⏱ Session"}</span>
          <span style={{color:isLow?"white":"#f59e0b",fontSize:14,fontWeight:800,fontFamily:"monospace"}}>{formatTime(secondsLeft)}</span>
        </div>

        {screen==="menu"&&<>
          <div style={{...S.header, background:color}}>
            <div style={{flex:1}}>
              <div style={S.stallName}>{branding?.stallName || "Uncle Lim's"} 🍗</div>
              <div style={S.stallSub}>{branding?.tagline || "Self Order"}</div>
            </div>
            <div style={{background:"rgba(255,255,255,0.2)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,color:"white"}}>🟢 Open</div>
          </div>
          <div style={S.tabs}>
            {menu.map(g=><button key={g.id} style={{...S.tab,...(activeCategory===g.id?{...S.tabActive,color,borderColor:color}:{})}} onClick={()=>setActiveCategory(g.id)}>{g.category}</button>)}
          </div>
          <div style={S.itemList}>
            {activeGroup?.items.map(item=>{
              const qty=cart[item.id]?.qty||0;
              return (
                <div key={item.id} style={{...S.itemCard,opacity:item.outOfStock?0.5:1}}>
                  <div style={{fontSize:34,minWidth:44,textAlign:"center"}}>{item.emoji}</div>
                  <div style={{flex:1}}>
                    <div style={S.itemName}>{item.name} {item.outOfStock&&<span style={S.outBadge}>Out of stock</span>}</div>
                    <div style={S.itemDesc}>{item.desc}</div>
                    <div style={{...S.itemPrice,color}}> RM {item.price.toFixed(2)}</div>
                  </div>
                  {!item.outOfStock&&<div style={S.qtyCtrl}>
                    {qty>0&&<><button style={{...S.qtyBtn,borderColor:color,color}} onClick={()=>remove(item.id)}>−</button><span style={S.qtyNum}>{qty}</span></>}
                    <button style={{...S.addBtn,background:color}} onClick={()=>add(item)}>+</button>
                  </div>}
                </div>
              );
            })}
          </div>
          {totalQty>0&&<button style={{...S.cartBar,background:color}} onClick={()=>setScreen("cart")}>
            <span style={S.cartBadge}>{totalQty}</span><span>View Order</span><span>RM {total.toFixed(2)}</span>
          </button>}
        </>}

        {screen==="cart"&&<>
          <div style={{...S.header,background:color}}><button style={S.backBtn} onClick={()=>setScreen("menu")}>←</button><div style={S.headerTitle}>Your Order</div></div>
          <div style={S.itemList}>
            {cartItems.map(item=>(
              <div key={item.id} style={S.cartRow}>
                <div style={{fontSize:28}}>{item.emoji}</div>
                <div style={{flex:1}}><div style={S.itemName}>{item.name}</div><div style={{...S.itemPrice,color}}>RM {item.price.toFixed(2)}</div></div>
                <div style={S.qtyCtrl}>
                  <button style={{...S.qtyBtn,borderColor:color,color}} onClick={()=>remove(item.id)}>−</button>
                  <span style={S.qtyNum}>{item.qty}</span>
                  <button style={{...S.addBtn,background:color}} onClick={()=>add(item)}>+</button>
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

        {screen==="payment"&&<>
          <div style={{...S.header,background:color}}>
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
            {payStep==="processing"&&<div style={{textAlign:"center"}}><div style={{fontSize:56}}>⏳</div><div style={{fontSize:20,fontWeight:700,marginTop:16,color:"#333"}}>Processing…</div></div>}
            {payStep==="done"&&<div style={{textAlign:"center"}}><div style={{fontSize:64}}>✅</div><div style={{fontSize:20,fontWeight:700,marginTop:16,color:"#333"}}>{placing?"Placing order…":"Payment successful!"}</div></div>}
          </div>
        </>}

        {screen==="confirm"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",textAlign:"center",gap:12,background:"#f9f5f0"}}>
            <div style={{fontSize:64}}>🎉</div>
            <div style={{fontSize:28,fontWeight:900,color:"#1a1a2e"}}>Order Placed!</div>
            <div style={{fontSize:14,color:"#999",fontWeight:600}}>Your queue number is</div>
            <div style={{fontSize:96,fontWeight:900,color,lineHeight:1,letterSpacing:"-4px"}}>{queueNum}</div>
            <div style={{fontSize:14,color:"#666",lineHeight:1.6,maxWidth:280}}>We'll call your number when your food is ready! 🍗</div>
            <div style={{background:"#fff3cd",color:"#856404",padding:"10px 20px",borderRadius:12,fontSize:14,fontWeight:600}}>Now serving: <strong>#{currentServing}</strong></div>
            <button style={{...S.bigBtn,background:color,marginTop:8,width:"auto",padding:"14px 40px"}} onClick={reset}>Order Again</button>
          </div>
        )}
      </div>
    </div>
  );
}

function FakeQR() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <rect width="160" height="160" fill="white"/>
      {[...Array(10)].map((_,r)=>[...Array(10)].map((_,c)=>{ const dark=(r+c+r*c)%3!==0; return dark?<rect key={`${r}-${c}`} x={10+c*14} y={10+r*14} width={12} height={12} fill="#1a1a2e" rx={1}/>:null; }))}
      {[[10,10],[108,10],[10,108]].map(([x,y],i)=>(<g key={i}><rect x={x} y={y} width={42} height={42} fill="#1a1a2e" rx={4}/><rect x={x+6} y={y+6} width={30} height={30} fill="white" rx={2}/><rect x={x+12} y={y+12} width={18} height={18} fill="#1a1a2e" rx={2}/></g>))}
    </svg>
  );
}

function StallDashboard({ orders, currentServing, advanceQueue, markDone, hours, updateHours, branding }) {
  const pending = orders.filter(o=>o.status==="pending");
  const done    = orders.filter(o=>o.status==="done");
  const prevPending = useRef(pending.length);
  const [newOrder, setNewOrder] = useState(false);
  const isOpen = hours ? isWithinHours(hours) : false;
  const color = branding?.primaryColor || "#c8102e";

  useEffect(() => {
    if (pending.length > prevPending.current) { setNewOrder(true); setTimeout(()=>setNewOrder(false),3000); playBeep(); }
    prevPending.current = pending.length;
  }, [pending.length]);

  return (
    <div style={{minHeight:"100vh",background:"#0f1117",fontFamily:"'Segoe UI',sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`@keyframes slidein{from{transform:translateY(-100%)}to{transform:translateY(0)}}`}</style>
      {newOrder&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:999,background:"#10b981",color:"white",padding:"16px",textAlign:"center",fontSize:16,fontWeight:800,animation:"slidein 0.3s ease"}}>🔔 New Order!</div>}

      <div style={{background:"#1a1a2e",padding:"16px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`3px solid ${color}`}}>
        <div style={{flex:1}}>
          <div style={{color:"white",fontSize:20,fontWeight:900}}>🧑‍🍳 {branding?.stallName || "Stall"} Dashboard</div>
          <div style={{color:"#aaa",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:isOpen?"#10b981":"#ef4444"}}></div>
            {isOpen?"Open · Accepting orders":"Closed · Not accepting orders"}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:"#aaa",fontSize:11,fontWeight:600}}>NOW SERVING</div>
          <div style={{color,fontSize:32,fontWeight:900,lineHeight:1}}>#{currentServing}</div>
        </div>
      </div>

      <div style={{padding:"12px 14px",background:"#16181f",borderBottom:"1px solid #1e2130"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{color:"white",fontSize:14,fontWeight:700}}>Manual Override</div>
            <div style={{color:"#555",fontSize:12}}>{hours?.manualOpen===null||hours?.manualOpen===undefined?"Following schedule":"Override active"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={{background:hours?.manualOpen===true?"#10b981":"#1e2130",color:"white",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}} onClick={()=>updateHours({...hours,manualOpen:true})}>Force Open</button>
            <button style={{background:hours?.manualOpen===false?"#ef4444":"#1e2130",color:"white",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}} onClick={()=>updateHours({...hours,manualOpen:false})}>Force Close</button>
            {hours?.manualOpen!==null&&hours?.manualOpen!==undefined&&(
              <button style={{background:"#2a2d3e",color:"#aaa",border:"none",borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}} onClick={()=>updateHours({...hours,manualOpen:null})}>Auto</button>
            )}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,padding:"14px",background:"#16181f"}}>
        {[
          {label:"Pending",value:pending.length,color:"#f59e0b",bg:"#2a2200"},
          {label:"Completed",value:done.length,color:"#10b981",bg:"#0a2a1a"},
          {label:"Revenue",value:`RM${done.reduce((s,o)=>s+o.total,0).toFixed(2)}`,color:"#3b82f6",bg:"#0a1a3a"},
        ].map(s=>(
          <div key={s.label} style={{background:s.bg,borderRadius:12,padding:"14px 10px",textAlign:"center",border:`1px solid ${s.color}33`}}>
            <div style={{color:s.color,fontSize:s.label==="Revenue"?15:24,fontWeight:900}}>{s.value}</div>
            <div style={{color:"#555",fontSize:11,fontWeight:600,marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{padding:"0 14px 14px"}}>
        <button style={{width:"100%",background:color,color:"white",border:"none",borderRadius:14,padding:"16px",fontSize:16,fontWeight:800,cursor:"pointer"}} onClick={advanceQueue}>
          📣 Call Next — #{currentServing+1}
        </button>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:10}}>
        {pending.length===0&&<div style={{textAlign:"center",color:"#333",padding:"48px 0",fontSize:15}}><div style={{fontSize:40,marginBottom:12}}>✅</div>No pending orders</div>}
        {pending.map(order=>(
          <div key={order.fbKey} style={{background:"#1e2130",borderRadius:16,padding:"16px",border:"1px solid #f59e0b44"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div><div style={{color:"white",fontWeight:900,fontSize:20}}>Queue <span style={{color:"#f59e0b"}}>#{order.queueNum}</span></div><div style={{color:"#555",fontSize:12}}>{order.time}</div></div>
              <div style={{color:"#10b981",fontWeight:800,fontSize:18}}>RM {order.total.toFixed(2)}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
              {order.items.map((item,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",color:"#ccc",fontSize:14}}><span>{item.emoji} {item.name}</span><span style={{color:"#666"}}>×{item.qty}</span></div>)}
            </div>
            {order.note&&<div style={{background:"#2a2d3e",borderRadius:8,padding:"8px 12px",color:"#f59e0b",fontSize:12,marginBottom:10}}>📝 {order.note}</div>}
            <button style={{width:"100%",background:"#10b981",color:"white",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}} onClick={()=>markDone(order.fbKey)}>
              ✓ Mark Ready — Call #{order.queueNum}
            </button>
          </div>
        ))}
        {done.length>0&&<>
          <div style={{color:"#2a2a2a",fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",marginTop:8}}>Completed</div>
          {[...done].reverse().map(order=>(
            <div key={order.fbKey} style={{background:"#161820",borderRadius:12,padding:"12px 14px",opacity:0.5}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div style={{color:"#444",fontWeight:700}}>#{order.queueNum} · {order.time}</div>
                <div style={{color:"#10b981",fontSize:12,fontWeight:700}}>✓ RM {order.total.toFixed(2)}</div>
              </div>
              <div style={{color:"#2a2a3a",fontSize:12,marginTop:3}}>{order.items.map(i=>`${i.emoji}${i.name}`).join(", ")}</div>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

function SalesReport({ orders }) {
  const [period, setPeriod] = useState("today");
  function startOf(p) { const d=new Date(); if(p==="today"){d.setHours(0,0,0,0);return d.getTime();} if(p==="week"){d.setDate(d.getDate()-7);d.setHours(0,0,0,0);return d.getTime();} return 0; }
  const filtered = orders.filter(o=>o.status==="done"&&o.timestamp>=startOf(period));
  const revenue = filtered.reduce((s,o)=>s+o.total,0);
  const orderCount = filtered.length;
  const avgOrder = orderCount>0?revenue/orderCount:0;
  const itemMap = {};
  filtered.forEach(o=>{ o.items?.forEach(item=>{ if(!itemMap[item.name]) itemMap[item.name]={name:item.name,emoji:item.emoji,qty:0,revenue:0}; itemMap[item.name].qty+=item.qty; itemMap[item.name].revenue+=item.price*item.qty; }); });
  const topItems = Object.values(itemMap).sort((a,b)=>b.qty-a.qty).slice(0,5);
  const maxCount = Math.max(...topItems.map(i=>i.qty),1);
  const byHour = Array(24).fill(0);
  filtered.forEach(o=>{ const h=new Date(o.timestamp).getHours(); byHour[h]++; });
  const peakHour = byHour.indexOf(Math.max(...byHour));
  const maxHour = Math.max(...byHour,1);
  const periodLabel = period==="today"?"Today":period==="week"?"Last 7 Days":"All Time";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:8,paddingBottom:4}}>
        {[["today","Today"],["week","7 Days"],["all","All Time"]].map(([val,label])=>(
          <button key={val} onClick={()=>setPeriod(val)} style={{flex:1,padding:"10px",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",background:period===val?"#c8102e":"#f0ebe4",color:period===val?"white":"#888"}}>{label}</button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {[{label:"Revenue",value:`RM ${revenue.toFixed(2)}`,color:"#10b981",bg:"#ecfdf5",icon:"💰"},{label:"Orders",value:orderCount,color:"#3b82f6",bg:"#eff6ff",icon:"🧾"},{label:"Avg Order",value:`RM ${avgOrder.toFixed(2)}`,color:"#f59e0b",bg:"#fffbeb",icon:"📈"}].map(s=>(
          <div key={s.label} style={{background:s.bg,borderRadius:14,padding:"14px 10px",textAlign:"center",border:`1px solid ${s.color}33`}}>
            <div style={{fontSize:18,marginBottom:4}}>{s.icon}</div>
            <div style={{color:s.color,fontSize:s.label==="Orders"?22:12,fontWeight:900,lineHeight:1.2}}>{s.value}</div>
            <div style={{color:"#aaa",fontSize:11,fontWeight:600,marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{background:"white",borderRadius:16,padding:"18px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{color:"#1a1a2e",fontWeight:800,fontSize:15,marginBottom:16}}>🏆 Top Items — {periodLabel}</div>
        {topItems.length===0?<div style={{color:"#ccc",textAlign:"center",padding:"16px 0"}}>No sales data yet</div>:topItems.map((item,i)=>(
          <div key={item.name} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{color:"#f59e0b",fontWeight:900,fontSize:13,minWidth:20}}>#{i+1}</div>
                <div style={{fontSize:18}}>{item.emoji}</div>
                <div style={{color:"#1a1a2e",fontSize:13,fontWeight:600}}>{item.name}</div>
              </div>
              <div style={{textAlign:"right"}}><div style={{color:"#10b981",fontSize:13,fontWeight:700}}>×{item.qty}</div><div style={{color:"#aaa",fontSize:11}}>RM {item.revenue.toFixed(2)}</div></div>
            </div>
            <div style={{background:"#f4f1ec",borderRadius:8,height:8,overflow:"hidden"}}><div style={{background:"linear-gradient(90deg,#c8102e,#f59e0b)",height:"100%",borderRadius:8,width:`${(item.qty/maxCount)*100}%`}}/></div>
          </div>
        ))}
      </div>
      <div style={{background:"white",borderRadius:16,padding:"18px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{color:"#1a1a2e",fontWeight:800,fontSize:15,marginBottom:4}}>⏰ Busiest Hours — {periodLabel}</div>
        {byHour.every(h=>h===0)?<div style={{color:"#ccc",textAlign:"center",padding:"16px 0"}}>No data yet</div>:<>
          <div style={{color:"#aaa",fontSize:12,marginBottom:12}}>Peak: <span style={{color:"#f59e0b",fontWeight:700}}>{peakHour}:00–{peakHour+1}:00</span> ({byHour[peakHour]} orders)</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:72}}>
            {Array(24).fill(0).map((_,h)=>(
              <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",background:h===peakHour?"#f59e0b":"#c8102e",borderRadius:"3px 3px 0 0",height:`${(byHour[h]/maxHour)*56}px`,minHeight:byHour[h]>0?4:0}}/>
                <div style={{color:byHour[h]>0?"#aaa":"#ddd",fontSize:8}}>{h}</div>
              </div>
            ))}
          </div>
        </>}
      </div>
      <div style={{background:"white",borderRadius:16,padding:"18px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{color:"#1a1a2e",fontWeight:800,fontSize:15,marginBottom:14}}>🧾 Recent Orders — {periodLabel}</div>
        {filtered.length===0?<div style={{color:"#ccc",textAlign:"center",padding:"16px 0"}}>No completed orders yet</div>:[...filtered].reverse().slice(0,20).map(order=>(
          <div key={order.fbKey} style={{borderBottom:"1px solid #f4f1ec",paddingBottom:12,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{color:"#f59e0b",fontWeight:700,fontSize:14}}>#{order.queueNum}</div>
              <div style={{color:"#10b981",fontWeight:700,fontSize:14}}>RM {order.total.toFixed(2)}</div>
            </div>
            <div style={{color:"#999",fontSize:12}}>{order.items?.map(i=>`${i.emoji}${i.name} ×${i.qty}`).join(", ")}</div>
            <div style={{color:"#ccc",fontSize:11,marginTop:3}}>{order.time} · {new Date(order.timestamp).toLocaleDateString("en-MY")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminPanel({ menu, hours, orders, branding, settings, onUpdateMenu, onUpdateHours, updateBranding, updateSettings }) {
  const [tab, setTab] = useState("menu");
  const [activeCategory, setActiveCategory] = useState(menu[0]?.id);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localHours, setLocalHours] = useState(hours);
  const [localBranding, setLocalBranding] = useState(branding);
  const [localSettings, setLocalSettings] = useState(settings);
  const [showPasswords, setShowPasswords] = useState({ stall:false, admin:false });
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const activeGroup = menu.find(g=>g.id===activeCategory);

  function showSaved() { setSaved(true); setTimeout(()=>setSaved(false),2000); }
  function toggleStock(catId,itemId) { onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:g.items.map(i=>i.id===itemId?{...i,outOfStock:!i.outOfStock}:i)}:g)); showSaved(); }
  function deleteItem(catId,itemId) { onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:g.items.filter(i=>i.id!==itemId)}:g)); showSaved(); }
  function saveEdit(catId,updatedItem) { onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:g.items.map(i=>i.id===updatedItem.id?updatedItem:i)}:g)); setEditing(null); showSaved(); }
  function addItem(catId,item) { onUpdateMenu(menu.map(g=>g.id===catId?{...g,items:[...g.items,{...item,id:genId(),outOfStock:false}]}:g)); setAdding(false); showSaved(); }
  function addCategory() { if(!newCatName.trim()) return; onUpdateMenu([...menu,{id:genId(),category:newCatName.trim(),items:[]}]); setNewCatName(""); setAddingCat(false); showSaved(); }
  function deleteCategory(catId) { if(menu.length<=1) return; const u=menu.filter(g=>g.id!==catId); onUpdateMenu(u); setActiveCategory(u[0].id); showSaved(); }
  function saveHours() { onUpdateHours(localHours); showSaved(); }
  function toggleDay(d) { const days=localHours.days.includes(d)?localHours.days.filter(x=>x!==d):[...localHours.days,d]; setLocalHours({...localHours,days}); }
  function saveBranding() { updateBranding(localBranding); showSaved(); }
  function saveSettings() {
    if (!localSettings.stallPassword.trim() || !localSettings.adminPassword.trim()) return alert("Passwords cannot be empty!");
    updateSettings(localSettings); showSaved();
  }

  const color = localBranding?.primaryColor || "#c8102e";

  return (
    <div style={{minHeight:"100vh",background:"#f4f1ec",fontFamily:"'Segoe UI',sans-serif",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#1a1a2e",padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1,color:"white",fontSize:18,fontWeight:900}}>⚙️ Admin Panel</div>
        {saved&&<div style={{background:"#10b981",color:"white",borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:700}}>✓ Saved!</div>}
        <a href="/" style={{background:"rgba(255,255,255,0.1)",color:"white",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:600,textDecoration:"none"}}>← Exit</a>
      </div>

      <div style={{background:"white",borderBottom:"2px solid #e8e0d5",display:"flex",overflowX:"auto"}}>
        {[["menu","🍗 Menu"],["hours","🕐 Hours"],["qr","📱 QR"],["branding","🎨 Brand"],["settings","🔐 Settings"],["report","📊 Report"]].map(([val,label])=>(
          <button key={val} style={{flex:1,padding:"12px 4px",border:"none",background:"none",fontSize:12,fontWeight:700,cursor:"pointer",borderBottom:tab===val?`3px solid #1a1a2e`:"3px solid transparent",color:tab===val?"#1a1a2e":"#999",whiteSpace:"nowrap"}} onClick={()=>setTab(val)}>{label}</button>
        ))}
      </div>

      {/* MENU TAB */}
      {tab==="menu"&&<>
        <div style={{background:"white",borderBottom:"2px solid #e8e0d5",padding:"0 12px",display:"flex",alignItems:"center",overflowX:"auto",gap:4}}>
          {menu.map(g=><button key={g.id} style={{...S.tab,...(activeCategory===g.id?{...S.tabActive,color:"#1a1a2e",borderColor:"#1a1a2e"}:{})}} onClick={()=>setActiveCategory(g.id)}>{g.category}</button>)}
          {addingCat?(
            <div style={{display:"flex",gap:6,padding:"8px 0",alignItems:"center"}}>
              <input autoFocus style={{border:"1.5px solid #ccc",borderRadius:8,padding:"6px 10px",fontSize:13,outline:"none",width:120}} placeholder="Category name" value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()}/>
              <button style={S.greenBtn} onClick={addCategory}>Add</button>
              <button style={S.ghostBtn} onClick={()=>{setAddingCat(false);setNewCatName("");}}>✕</button>
            </div>
          ):<button style={{...S.tab,color:"#10b981",fontWeight:700,whiteSpace:"nowrap"}} onClick={()=>setAddingCat(true)}>+ Category</button>}
        </div>
        {menu.length>1&&<div style={{padding:"10px 16px 0",display:"flex",justifyContent:"flex-end"}}><button style={{...S.ghostBtn,color:"#ef4444",borderColor:"#ef4444",fontSize:12}} onClick={()=>deleteCategory(activeCategory)}>🗑 Delete "{activeGroup?.category}"</button></div>}
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
          {activeGroup?.items.map(item=>(
            editing?.id===item.id?(
              <EditForm key={item.id} item={item} catId={activeCategory} onSave={saveEdit} onCancel={()=>setEditing(null)}/>
            ):(
              <div key={item.id} style={{background:"white",borderRadius:14,padding:"14px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",border:item.outOfStock?"2px dashed #fca5a5":"2px solid transparent"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontSize:30}}>{item.emoji}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:item.outOfStock?"#aaa":"#1a1a2e",fontSize:14}}>{item.name} {item.outOfStock&&<span style={S.outBadge}>Out of stock</span>}</div>
                    <div style={{color:"#999",fontSize:12}}>{item.desc}</div>
                    <div style={{color:"#c8102e",fontWeight:800,fontSize:14,marginTop:2}}>RM {item.price.toFixed(2)}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button style={{...S.ghostBtn,flex:1}} onClick={()=>setEditing(item)}>✏️ Edit</button>
                  <button style={{...S.ghostBtn,flex:1,color:item.outOfStock?"#10b981":"#f59e0b",borderColor:item.outOfStock?"#10b981":"#f59e0b"}} onClick={()=>toggleStock(activeCategory,item.id)}>{item.outOfStock?"✓ Back in Stock":"⊘ Out of Stock"}</button>
                  <button style={{...S.ghostBtn,color:"#ef4444",borderColor:"#ef4444",padding:"8px 12px"}} onClick={()=>deleteItem(activeCategory,item.id)}>🗑</button>
                </div>
              </div>
            )
          ))}
          {adding?<EditForm catId={activeCategory} isNew onSave={addItem} onCancel={()=>setAdding(false)}/>:(
            <button style={{background:"#1a1a2e",color:"white",border:"none",borderRadius:14,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer"}} onClick={()=>setAdding(true)}>+ Add New Item</button>
          )}
        </div>
      </>}

      {/* HOURS TAB */}
      {tab==="hours"&&(
        <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a1a2e",marginBottom:16}}>🕐 Operating Hours</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:6}}>Opening Time</div>
                <input type="time" value={localHours.open} onChange={e=>setLocalHours({...localHours,open:e.target.value})} style={{width:"100%",border:"1.5px solid #e0d9d0",borderRadius:8,padding:"10px",fontSize:15,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:6}}>Closing Time</div>
                <input type="time" value={localHours.close} onChange={e=>setLocalHours({...localHours,close:e.target.value})} style={{width:"100%",border:"1.5px solid #e0d9d0",borderRadius:8,padding:"10px",fontSize:15,outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:10}}>Open on these days</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              {DAY_NAMES.map((name,i)=>(
                <button key={i} onClick={()=>toggleDay(i)} style={{padding:"8px 14px",borderRadius:20,border:"2px solid",fontSize:13,fontWeight:700,cursor:"pointer",borderColor:localHours.days.includes(i)?"#1a1a2e":"#ddd",background:localHours.days.includes(i)?"#1a1a2e":"white",color:localHours.days.includes(i)?"white":"#999"}}>{name}</button>
              ))}
            </div>
            <button style={{...S.greenBtn,width:"100%",padding:"14px",fontSize:15}} onClick={saveHours}>Save Hours</button>
          </div>
          <div style={{background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a1a2e",marginBottom:4}}>⏱ Session Duration</div>
            <div style={{color:"#999",fontSize:13,marginBottom:16}}>How long students can order after scanning QR</div>
            <div style={{background:"#f4f1ec",borderRadius:12,padding:"16px",textAlign:"center"}}>
              <div style={{fontSize:36,fontWeight:900,color:"#c8102e"}}>{SESSION_MINUTES}</div>
              <div style={{color:"#666",fontSize:13,fontWeight:600}}>minutes per session</div>
              <div style={{color:"#aaa",fontSize:11,marginTop:6}}>To change, edit SESSION_MINUTES in App.jsx</div>
            </div>
          </div>
        </div>
      )}

      {/* QR TAB */}
      {tab==="qr"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:16}}>
          <div style={{fontSize:15,fontWeight:700,color:"#1a1a2e"}}>Your Ordering QR Code</div>
          <div style={{background:"white",padding:16,borderRadius:16,boxShadow:"0 4px 24px rgba(0,0,0,0.1)",border:`3px solid ${color}`}}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(window.location.origin)}`} alt="QR" style={{width:220,height:220,display:"block"}}/>
          </div>
          <div style={{fontSize:13,color:"#999",textAlign:"center",maxWidth:260,lineHeight:1.7}}>Print this and stick it on your table.<br/>Students scan → {SESSION_MINUTES} min session → auto expires.</div>
          <a href="/qr" target="_blank" style={{...S.greenBtn,textDecoration:"none",padding:"14px 32px",fontSize:15}}>🖨️ Open Printable QR Page</a>
        </div>
      )}

      {/* BRANDING TAB */}
      {tab==="branding"&&(
        <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a1a2e",marginBottom:16}}>🎨 Stall Branding</div>
            <Field label="Stall Name" value={localBranding.stallName} onChange={v=>setLocalBranding({...localBranding,stallName:v})} placeholder="e.g. Uncle Lim's"/>
            <Field label="Tagline" value={localBranding.tagline} onChange={v=>setLocalBranding({...localBranding,tagline:v})} placeholder="e.g. Block A Canteen · Self Order"/>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:10}}>Primary Colour</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>setLocalBranding({...localBranding,primaryColor:c})}
                    style={{width:44,height:44,borderRadius:22,background:c,border:localBranding.primaryColor===c?"4px solid #1a1a2e":"4px solid transparent",cursor:"pointer",transition:"transform 0.1s",transform:localBranding.primaryColor===c?"scale(1.15)":"scale(1)"}}/>
                ))}
              </div>
            </div>
            {/* Preview */}
            <div style={{background:"#f4f1ec",borderRadius:12,padding:"16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:10}}>Preview</div>
              <div style={{background:localBranding.primaryColor,borderRadius:12,padding:"14px 16px",color:"white"}}>
                <div style={{fontWeight:800,fontSize:16}}>{localBranding.stallName || "Stall Name"} 🍗</div>
                <div style={{fontSize:12,opacity:0.8,marginTop:3}}>{localBranding.tagline || "Tagline"}</div>
              </div>
            </div>
            <button style={{...S.greenBtn,width:"100%",padding:"14px",fontSize:15}} onClick={saveBranding}>Save Branding</button>
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab==="settings"&&(
        <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a1a2e",marginBottom:4}}>🔐 Change Passwords</div>
            <div style={{color:"#999",fontSize:13,marginBottom:20}}>Change passwords for the stall dashboard and admin panel.</div>

            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:6}}>Stall Dashboard Password</div>
              <div style={{position:"relative"}}>
                <input type={showPasswords.stall?"text":"password"} value={localSettings.stallPassword} onChange={e=>setLocalSettings({...localSettings,stallPassword:e.target.value})}
                  style={{width:"100%",border:"1.5px solid #e0d9d0",borderRadius:8,padding:"10px 40px 10px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                <button onClick={()=>setShowPasswords(p=>({...p,stall:!p.stall}))} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16}}>
                  {showPasswords.stall?"🙈":"👁️"}
                </button>
              </div>
            </div>

            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:6}}>Admin Panel Password</div>
              <div style={{position:"relative"}}>
                <input type={showPasswords.admin?"text":"password"} value={localSettings.adminPassword} onChange={e=>setLocalSettings({...localSettings,adminPassword:e.target.value})}
                  style={{width:"100%",border:"1.5px solid #e0d9d0",borderRadius:8,padding:"10px 40px 10px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                <button onClick={()=>setShowPasswords(p=>({...p,admin:!p.admin}))} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16}}>
                  {showPasswords.admin?"🙈":"👁️"}
                </button>
              </div>
            </div>

            <div style={{background:"#fff3cd",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
              <div style={{color:"#856404",fontSize:12,fontWeight:600}}>⚠️ After saving, you'll need the new password to log back in. Don't forget it!</div>
            </div>
            <button style={{...S.greenBtn,width:"100%",padding:"14px",fontSize:15}} onClick={saveSettings}>Save Passwords</button>
          </div>

          <div style={{background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a1a2e",marginBottom:4}}>📋 Your URLs</div>
            <div style={{color:"#999",fontSize:13,marginBottom:16}}>Share these with the right people only.</div>
            {[
              {label:"Student Ordering",url:"/",icon:"🛒"},
              {label:"Stall Dashboard",url:"/stall",icon:"🧑‍🍳"},
              {label:"Admin Panel",url:"/admin",icon:"⚙️"},
              {label:"Printable QR",url:"/qr",icon:"📱"},
            ].map(item=>(
              <div key={item.url} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #f4f1ec"}}>
                <span style={{fontSize:20}}>{item.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1a1a2e"}}>{item.label}</div>
                  <div style={{fontSize:12,color:"#aaa"}}>{window.location.origin}{item.url}</div>
                </div>
                <button onClick={()=>navigator.clipboard.writeText(window.location.origin+item.url)} style={{...S.ghostBtn,fontSize:12,padding:"6px 12px"}}>Copy</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REPORT TAB */}
      {tab==="report"&&(
        <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
          <SalesReport orders={orders} />
        </div>
      )}
    </div>
  );
}

function EditForm({ item, catId, onSave, onCancel, isNew }) {
  const [form, setForm] = useState(item||{name:"",desc:"",price:"",emoji:"🍗"});
  const [showEmoji, setShowEmoji] = useState(false);
  function set(k,v) { setForm(p=>({...p,[k]:v})); }
  function handleSave() { if(!form.name.trim()||!form.price) return; onSave(catId,{...form,price:parseFloat(form.price)}); }
  return (
    <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 4px 16px rgba(0,0,0,0.12)",border:"2px solid #1a1a2e"}}>
      <div style={{fontWeight:800,fontSize:15,marginBottom:14,color:"#1a1a2e"}}>{isNew?"New Item":"Edit Item"}</div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:"#999",marginBottom:6}}>Icon</div>
        <button style={{fontSize:32,background:"#f4f1ec",border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer"}} onClick={()=>setShowEmoji(p=>!p)}>{form.emoji}</button>
        {showEmoji&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8,background:"#f4f1ec",borderRadius:10,padding:8}}>{EMOJIS.map(e=><button key={e} style={{fontSize:24,background:"none",border:"none",cursor:"pointer",borderRadius:6,padding:4}} onClick={()=>{set("emoji",e);setShowEmoji(false);}}>{e}</button>)}</div>}
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
  greenBtn:{background:"#10b981",color:"white",border:"none",borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"},
  ghostBtn:{background:"none",color:"#555",border:"1.5px solid #ddd",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"},
};