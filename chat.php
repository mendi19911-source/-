<?php
ob_start();
error_reporting(0);
ini_set('display_errors', 0);
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
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
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
    $resp = crm('checkUser', ['phone' => $phone]);
    if (!$resp || !($resp['success'] ?? false) || empty($resp['data'])) {
        return "❌ המספר $phone לא מזוהה במערכת כחנות.";
    }

    $data = $resp['data'];
    $user = $data['user'] ?? [];
    $deals = $data['deals'] ?? [];
    $storeName = $user['name'] ?? 'חנות';
    $storeId = $user['id'] ?? null;
    $city = $user['city'] ?? '';

    // עסקאות / סטטוס
    if (str_contains($ltext, 'עסקה') || str_contains($ltext, 'עסקאות') || str_contains($ltext, 'סטטוס') || str_contains($ltext, 'מה קורה') || str_contains($ltext, 'שלום')) {
        if (empty($deals)) {
            return "📋 **$storeName** — אין עסקאות פתוחות כרגע.";
        }
        $out = "📋 **עסקאות של $storeName** ($city):\n\n";
        foreach ($deals as $d) {
            $status = $d['status']['name'] ?? '';
            $company = $d['company']['name'] ?? '';
            $customer = $d['name'] ?? '';
            $out .= "👤 $customer";
            if ($company) $out .= " | $company";
            if ($status) $out .= " | $status";
            $out .= "\n";

            foreach (($d['details'] ?? []) as $det) {
                $tel = $det['tel_number'] ?? '';
                $pkg = $det['package_raw']['name'] ?? '';
                $detStatus = $det['status']['name'] ?? '';
                if ($tel) $out .= "   📱 $tel";
                if ($pkg) $out .= " — $pkg";
                if ($detStatus) $out .= " ($detStatus)";
                $out .= "\n";
            }
            $out .= "\n";
        }
        return $out;
    }

    // חבילות
    if (str_contains($ltext, 'חבילה') || str_contains($ltext, 'חבילות')) {
        $res = crm('get-packages', []);
        $pkgs = $res['data'] ?? [];
        if (empty($pkgs)) return "לא נמצאו חבילות.";
        $out = "📦 **חבילות זמינות:**\n\n";
        foreach (array_slice($pkgs, 0, 10) as $p) {
            $name = $p['name'] ?? $p['title'] ?? '';
            $cost = $p['cost'] ?? '';
            $out .= "• $name";
            if ($cost) $out .= " — ₪$cost";
            $out .= "\n";
        }
        return $out;
    }

    // ברירת מחדל — פרטי חנות + עסקאות
    $out = "🏪 **$storeName**";
    if ($city) $out .= " | $city";
    $out .= "\n";
    if (!empty($user['phone'])) $out .= "📱 " . $user['phone'] . "\n";
    if (!empty($user['email'])) $out .= "✉️ " . $user['email'] . "\n";
    $out .= "\n";

    if (!empty($deals)) {
        $out .= "עסקאות אחרונות: " . count($deals) . "\n\n";
        foreach (array_slice($deals, 0, 3) as $d) {
            $status = $d['status']['name'] ?? '';
            $company = $d['company']['name'] ?? '';
            $customer = $d['name'] ?? '';
            $out .= "• $customer — $company — $status\n";
        }
    } else {
        $out .= "אין עסקאות פתוחות.\n";
    }

    $out .= "\nמה תרצה לדעת?\n• **עסקאות** — רשימת עסקאות מפורטת\n• **חבילות** — חבילות זמינות למכירה";
    return $out;
}

// API endpoint
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    ob_clean();
    header('Content-Type: application/json; charset=utf-8');
    $body = json_decode(file_get_contents('php://input'), true);
    $phone = preg_replace('/\D/', '', $body['phone'] ?? '');
    $text  = $body['message'] ?? '';
    if (!$phone || !$text) {
        echo json_encode(['reply' => 'שגיאה: חסר מספר או הודעה']);
        exit;
    }
    try {
        $reply = handleMessage($phone, $text);
        echo json_encode(['reply' => $reply], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
        echo json_encode(['reply' => 'שגיאה: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
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
  .container { width: 100%; max-width: 520px; height: 100vh; display: flex; flex-direction: column; background: #fff; }
  .header { background: #075e54; color: #fff; padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
  .header .avatar { width: 42px; height: 42px; border-radius: 50%; background: #25d366; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .header .info h2 { font-size: 16px; }
  .header .info p { font-size: 12px; opacity: .8; }
  .phone-bar { background: #f0f0f0; padding: 10px 16px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #ddd; }
  .phone-bar label { font-size: 13px; color: #555; white-space: nowrap; }
  .phone-bar input { flex: 1; border: 1px solid #ccc; border-radius: 20px; padding: 6px 12px; font-size: 14px; outline: none; direction: ltr; }
  .messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; background: #e5ddd5; }
  .bubble { max-width: 85%; padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .bubble.user { background: #dcf8c6; align-self: flex-end; border-bottom-left-radius: 0; }
  .bubble.bot  { background: #fff; align-self: flex-start; border-bottom-right-radius: 0; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
  .input-bar { padding: 10px 12px; background: #f0f0f0; display: flex; gap: 8px; align-items: center; }
  .input-bar textarea { flex: 1; border: none; border-radius: 20px; padding: 10px 16px; font-size: 14px; resize: none; outline: none; max-height: 100px; font-family: Arial, sans-serif; }
  .input-bar button { background: #075e54; color: #fff; border: none; border-radius: 50%; width: 44px; height: 44px; font-size: 20px; cursor: pointer; flex-shrink: 0; }
  .input-bar button:hover { background: #128c7e; }
  .typing { font-size: 12px; color: #888; padding: 4px 16px; min-height: 20px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="avatar">🤖</div>
    <div class="info"><h2>בוט אול אין</h2><p>מחובר ל-CRM של ideali</p></div>
  </div>
  <div class="phone-bar">
    <label>📱 מספר חנות:</label>
    <input type="tel" id="phone" placeholder="0509089908" value="0509089908">
  </div>
  <div class="messages" id="messages">
    <div class="bubble bot">שלום! אני הבוט של אול אין 👋<br><br>אני יכול לעזור לך עם:<br>• <b>עסקאות</b> — רשימת עסקאות וסטטוסים<br>• <b>חבילות</b> — חבילות זמינות למכירה<br><br>שנה את המספר למעלה אם צריך, ואז כתוב מה תרצה לדעת.</div>
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
    const res = await fetch(location.href, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({phone, message: msg})
    });
    const data = await res.json();
    addBubble(data.reply, 'bot');
  } catch(e) {
    addBubble('שגיאת תקשורת — נסה שוב 😕\n' + e, 'bot');
  }
  document.getElementById('typing').textContent = '';
}
document.getElementById('msg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
</script>
</body>
</html>
