<?php
define('CRM_BASE', 'https://crm.ideali.co.il/api/aibot');
define('CRM_TOKEN', 'jkFGD78dfgDj8797gsjkh8fdgdf');

$COMPANIES = [1=>'סלקום',2=>'פרטנר',4=>'פלאפון',5=>'גולן טלקום',6=>'הוט מובייל',12=>'wecom'];
$STATUSES = [
    'OPEN'=>'פתוח',
    'PROCESS_SHOP'=>'בטיפול חנות',
    'WAITING_CONNECT'=>'ממתין לחיבור',
    'CONN_NOT_NIY'=>'חובר - לא נויד',
    'NIYUD_ACTIVATED'=>'נויד ומופעל',
    'DONE'=>'הושלם',
    'CANCELLED'=>'בוטל',
    'ROBOT_ERROR_SYS'=>'שגיאת מערכת',
];

function crm($endpoint, $params=[]) {
    $params['token'] = CRM_TOKEN;
    $url = CRM_BASE . '/' . $endpoint . '?' . http_build_query($params);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

function handleMessage($phone, $text) {
    global $COMPANIES, $STATUSES;

    $text = trim($text);
    $ltext = mb_strtolower($text);

    // זיהוי חנות
    $user = crm('checkUser', ['phone' => $phone]);
    if (!$user || empty($user['data'])) {
        return "❌ המספר $phone לא מזוהה במערכת כחנות.";
    }
    $store = $user['data'];
    $storeId = $store['id'] ?? $store['user_id'] ?? null;
    $storeName = $store['name'] ?? $store['business_name'] ?? 'חנות';

    // בדיקת חברה
    if (str_contains($ltext, 'חברה') || str_contains($ltext, 'ספק') || str_contains($ltext, 'provider')) {
        $res = crm('checkProvider', ['phone' => $phone]);
        if ($res && isset($res['data']['provider_id'])) {
            $cid = $res['data']['provider_id'];
            $cname = $COMPANIES[$cid] ?? "חברה $cid";
            return "📡 המספר $phone משויך ל-**$cname**.";
        }
        return "לא נמצאה חברה עבור המספר.";
    }

    // עסקאות
    if (str_contains($ltext, 'עסקה') || str_contains($ltext, 'עסקאות') || str_contains($ltext, 'סטטוס')) {
        $q = '';
        // אם יש מספר בטקסט - חפש לפיו
        if (preg_match('/05\d{8}/', $text, $m)) $q = $m[0];
        $res = crm('deals', ['id' => $storeId, 'q' => $q]);
        $deals = $res['data'] ?? [];
        if (empty($deals)) return "לא נמצאו עסקאות" . ($q ? " עבור $q" : "") . ".";
        $out = "📋 **עסקאות של $storeName:**\n\n";
        foreach (array_slice($deals, 0, 5) as $d) {
            $status = $STATUSES[$d['status'] ?? ''] ?? ($d['status'] ?? '');
            $out .= "• " . ($d['customer_phone'] ?? $d['phone'] ?? '') . " — $status";
            if (!empty($d['company_id'])) $out .= " | " . ($COMPANIES[$d['company_id']] ?? '');
            $out .= "\n";
        }
        if (count($deals) > 5) $out .= "\n...ועוד " . (count($deals)-5) . " עסקאות נוספות.";
        return $out;
    }

    // חבילות
    if (str_contains($ltext, 'חבילה') || str_contains($ltext, 'חבילות')) {
        $res = crm('packagesByBiz', ['token' => CRM_TOKEN]);
        $pkgs = $res['data'] ?? [];
        if (empty($pkgs)) {
            $res = crm('get-packages', []);
            $pkgs = $res['data'] ?? [];
        }
        if (empty($pkgs)) return "לא נמצאו חבילות.";
        $out = "📦 **חבילות זמינות:**\n\n";
        foreach (array_slice($pkgs, 0, 8) as $p) {
            $out .= "• " . ($p['name'] ?? $p['title'] ?? json_encode($p)) . "\n";
        }
        return $out;
    }

    // ברירת מחדל — פרטי חנות
    $out = "🏪 **$storeName**\n";
    if (!empty($store['phone'])) $out .= "טלפון: " . $store['phone'] . "\n";
    if (!empty($store['email'])) $out .= "אימייל: " . $store['email'] . "\n";
    $out .= "\nמה תרצה לדעת?\n• סטטוס עסקאות\n• באיזו חברה מספר מסוים\n• חבילות למכירה";
    return $out;
}

// API endpoint
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $body = json_decode(file_get_contents('php://input'), true);
    $phone = preg_replace('/\D/', '', $body['phone'] ?? '');
    $text  = $body['message'] ?? '';
    if (!$phone || !$text) { echo json_encode(['reply'=>'שגיאה: חסר מספר או הודעה']); exit; }
    echo json_encode(['reply' => handleMessage($phone, $text)]);
    exit;
}
?>
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>אול אין — בוט CRM</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #e5ddd5; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .container { width: 100%; max-width: 480px; height: 100vh; display: flex; flex-direction: column; background: #fff; }
  .header { background: #075e54; color: #fff; padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
  .header .avatar { width: 42px; height: 42px; border-radius: 50%; background: #25d366; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .header .info h2 { font-size: 16px; }
  .header .info p { font-size: 12px; opacity: .8; }
  .phone-bar { background: #f0f0f0; padding: 10px 16px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #ddd; }
  .phone-bar label { font-size: 13px; color: #555; white-space: nowrap; }
  .phone-bar input { flex: 1; border: 1px solid #ccc; border-radius: 20px; padding: 6px 12px; font-size: 14px; outline: none; }
  .messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; background: #e5ddd5; }
  .bubble { max-width: 80%; padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .bubble.user { background: #dcf8c6; align-self: flex-end; border-bottom-left-radius: 0; }
  .bubble.bot  { background: #fff; align-self: flex-start; border-bottom-right-radius: 0; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
  .bubble.bot strong, .bubble.bot b { font-weight: bold; }
  .input-bar { padding: 10px 12px; background: #f0f0f0; display: flex; gap: 8px; align-items: center; }
  .input-bar textarea { flex: 1; border: none; border-radius: 20px; padding: 10px 16px; font-size: 14px; resize: none; outline: none; max-height: 100px; font-family: Arial, sans-serif; }
  .input-bar button { background: #075e54; color: #fff; border: none; border-radius: 50%; width: 44px; height: 44px; font-size: 20px; cursor: pointer; flex-shrink: 0; }
  .input-bar button:hover { background: #128c7e; }
  .typing { font-size: 12px; color: #888; padding: 4px 16px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="avatar">🤖</div>
    <div class="info"><h2>בוט אול אין</h2><p>מחובר ל-CRM</p></div>
  </div>
  <div class="phone-bar">
    <label>📱 מספר חנות:</label>
    <input type="tel" id="phone" placeholder="0509089908" value="0509089908">
  </div>
  <div class="messages" id="messages">
    <div class="bubble bot">שלום! אני הבוט של אול אין 👋<br>אני יכול לעזור לך עם:<br>• סטטוס עסקאות<br>• זיהוי חברה לפי מספר<br>• חבילות למכירה<br><br>מה תרצה לדעת?</div>
  </div>
  <div class="typing" id="typing"></div>
  <div class="input-bar">
    <textarea id="msg" rows="1" placeholder="כתוב הודעה..."></textarea>
    <button onclick="send()">➤</button>
  </div>
</div>
<script>
function addBubble(text, who) {
  const d = document.getElementById('messages');
  const b = document.createElement('div');
  b.className = 'bubble ' + who;
  b.innerHTML = text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  d.appendChild(b);
  d.scrollTop = d.scrollHeight;
}
async function send() {
  const msg = document.getElementById('msg').value.trim();
  const phone = document.getElementById('phone').value.trim();
  if (!msg || !phone) return;
  addBubble(msg, 'user');
  document.getElementById('msg').value = '';
  document.getElementById('typing').textContent = 'הבוט מקליד...';
  try {
    const res = await fetch('', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({phone, message: msg}) });
    const data = await res.json();
    addBubble(data.reply, 'bot');
  } catch(e) { addBubble('שגיאת תקשורת 😕', 'bot'); }
  document.getElementById('typing').textContent = '';
}
document.getElementById('msg').addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
</script>
</body>
</html>
