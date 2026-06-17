<?php
define('CRM_BASE', 'https://crm.ideali.co.il/api/aibot');
define('CRM_TOKEN', 'jkFGD78dfgDj8797gsjkh8fdgdf');

$COMPANIES = [1=>'סלקום',2=>'פרטנר',4=>'פלאפון',5=>'גולן טלקום',6=>'הוט מובייל',12=>'wecom'];
$STATUSES_HE = [
    'OPEN'=>'פתוח','PROCESS_SHOP'=>'בטיפול חנות','WAITING_CONNECT'=>'ממתין לחיבור',
    'CONN_NOT_NIY'=>'חובר - לא נויד','NIYUD_ACTIVATED'=>'נויד ומופעל',
    'DONE'=>'הושלם','CANCELLED'=>'בוטל','ROBOT_ERROR_SYS'=>'שגיאת מערכת',
];

function crmGet($endpoint, $params=[]) {
    $params['token'] = CRM_TOKEN;
    $url = CRM_BASE . '/' . $endpoint . '?' . http_build_query($params);
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) return ['error' => $err];
    $decoded = json_decode($res, true);
    if ($decoded === null) return ['error' => 'bad json: ' . substr($res, 0, 100)];
    return $decoded;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    $phone = preg_replace('/\D/', '', $body['phone'] ?? '');
    $text = trim($body['message'] ?? '');

    if (!$phone || !$text) {
        echo json_encode(['reply' => 'שגיאה: חסר מספר או הודעה'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // זיהוי חנות
    $resp = crmGet('checkUser', ['phone' => $phone]);
    if (isset($resp['error'])) {
        echo json_encode(['reply' => 'שגיאת חיבור ל-CRM: ' . $resp['error']], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (empty($resp['success']) || empty($resp['data'])) {
        echo json_encode(['reply' => "המספר $phone לא מזוהה במערכת."], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data    = $resp['data'];
    $user    = $data['user'] ?? [];
    $deals   = $data['deals'] ?? [];
    $name    = $user['name'] ?? 'חנות';
    $city    = $user['city'] ?? '';
    $email   = $user['email'] ?? '';
    $uphone  = $user['phone'] ?? '';

    $ltext = strtolower($text);

    // חבילות — בדוק קודם
    if (strpos($text, 'חבילה') !== false || strpos($text, 'חבילות') !== false || strpos($text, 'מחיר') !== false) {
        $r2 = crmGet('get-packages');
        $pkgs = $r2['data'] ?? [];
        if (empty($pkgs)) {
            echo json_encode(['reply' => 'לא נמצאו חבילות.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $out = "📦 חבילות זמינות:\n\n";
        foreach (array_slice($pkgs, 0, 10) as $p) {
            $pname = $p['name'] ?? $p['title'] ?? '';
            $cost  = $p['cost'] ?? '';
            $out .= "• $pname";
            if ($cost) $out .= " — ₪$cost";
            $out .= "\n";
        }
        echo json_encode(['reply' => $out], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ברירת מחדל — תמיד הצג עסקאות
    if (true) {
        if (empty($deals)) {
            echo json_encode(['reply' => "📋 $name — אין עסקאות כרגע."], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $out = "📋 עסקאות של $name";
        if ($city) $out .= " ($city)";
        $out .= ":\n\n";
        foreach ($deals as $d) {
            $cname   = $d['company']['name'] ?? '';
            $status  = $d['status']['name'] ?? '';
            $cust    = $d['name'] ?? '';
            $out .= "👤 $cust";
            if ($cname) $out .= " | $cname";
            if ($status) $out .= " | $status";
            $out .= "\n";
            foreach (($d['details'] ?? []) as $det) {
                $tel   = $det['tel_number'] ?? '';
                $pkg   = $det['package_raw']['name'] ?? '';
                $ds    = $det['status']['name'] ?? '';
                if ($tel || $pkg) {
                    $out .= "   📱 $tel";
                    if ($pkg) $out .= " — $pkg";
                    if ($ds) $out .= " ($ds)";
                    $out .= "\n";
                }
            }
            $out .= "\n";
        }
        echo json_encode(['reply' => $out], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ברירת מחדל — פרטי חנות + עסקאות
    $out = "🏪 $name";
    if ($city) $out .= " | $city";
    $out .= "\n";
    if ($uphone) $out .= "📱 $uphone\n";
    if ($email) $out .= "✉️ $email\n";
    $out .= "\nיש " . count($deals) . " עסקאות.\n\n";
    $out .= "כתוב:\n• **עסקאות** — לפרטים מלאים\n• **חבילות** — חבילות למכירה";
    echo json_encode(['reply' => $out], JSON_UNESCAPED_UNICODE);
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
  body { font-family: Arial, sans-serif; background: #e5ddd5; height: 100vh; display: flex; align-items: center; justify-content: center; }
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
    <input type="tel" id="phone" placeholder="0544951010" value="0544951010">
  </div>
  <div class="messages" id="messages">
    <div class="bubble bot">שלום! אני הבוט של אול אין 👋<br><br>אני יכול לעזור לך עם:<br>• <b>עסקאות</b> — רשימת עסקאות וסטטוסים<br>• <b>חבילות</b> — חבילות זמינות למכירה<br><br>פשוט כתוב מה תרצה לדעת.</div>
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
  b.innerHTML = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
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
    const res = await fetch('', {
      method: 'POST',
      headers: {'Content-Type': 'application/json; charset=utf-8'},
      body: JSON.stringify({phone, message: msg})
    });
    const text = await res.text();
    const data = JSON.parse(text);
    addBubble(data.reply, 'bot');
  } catch(e) {
    addBubble('שגיאת תקשורת 😕\n' + e, 'bot');
  }
  document.getElementById('typing').textContent = '';
}
document.getElementById('msg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
</script>
</body>
</html>
