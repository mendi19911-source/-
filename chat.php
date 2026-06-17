<?php
define('CRM_BASE', 'https://crm.ideali.co.il/api/aibot');
define('CRM_TOKEN', 'jkFGD78dfgDj8797gsjkh8fdgdf');

$COMPANIES = [
    1  => 'סלקום',
    2  => 'פרטנר',
    4  => 'פלאפון',
    5  => 'גולן טלקום',
    6  => 'הוט מובייל',
    12 => 'wecom',
];

$STATUSES = [
    'OPEN'             => 'פתוחה — טרם טופלה',
    'PROCESS_SHOP'     => 'דורש טיפול מהחנות',
    'WAITING_CONNECT'  => 'ממתין לחיבור',
    'CONN_NOT_NIY'     => 'חובר — הניוד לא הושלם',
    'NIYUD_ACTIVATED'  => 'הניוד יצא לדרך',
    'DONE'             => 'הושלמה בהצלחה',
    'CANCELLED'        => 'מבוטלת',
    'ROBOT_ERROR_SYS'  => 'שגיאת מערכת',
];

// ── קריאה ל-CRM ───────────────────────────────────────────────
function crmGet($endpoint, $extra = []) {
    $params = array_merge(['token' => CRM_TOKEN], $extra);
    $url = CRM_BASE . '/' . $endpoint . '?' . http_build_query($params);
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $res  = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err || !$res) return null;
    return json_decode($res, true);
}

// ── עזר: בדוק אם טקסט מכיל אחת מהמילים ─────────────────────
function contains($text, $words) {
    foreach ($words as $w) {
        if (strpos($text, $w) !== false) return true;
    }
    return false;
}

// ── עזר: עסקה יחידה לטקסט קריא ─────────────────────────────
function dealToText($d, $COMPANIES, $STATUSES) {
    $cname  = $d['company']['name'] ?? ($COMPANIES[$d['company']['id'] ?? 0] ?? '');
    $suid   = $d['status']['uid']  ?? '';
    $sname  = $STATUSES[$suid] ?? ($d['status']['name'] ?? '');
    $cust   = $d['name']       ?? '';
    $phone  = $d['cphone1']    ?? '';
    $date   = substr($d['created_at'] ?? '', 0, 10);

    $out  = "👤 *$cust*";
    if ($phone)  $out .= " | 📱 $phone";
    if ($cname)  $out .= " | $cname";
    $out .= "\n";
    $out .= "   סטטוס: $sname";
    if ($date)   $out .= " (נפתח $date)";
    $out .= "\n";

    foreach (($d['details'] ?? []) as $det) {
        $tel   = $det['tel_number']        ?? '';
        $pkg   = $det['package_raw']['name'] ?? '';
        $cost  = $det['package_raw']['cost'] ?? '';
        $ds    = $det['status']['name']    ?? '';
        $sim   = $det['simcard']           ?? '';

        $line = "   📞 $tel";
        if ($pkg)  $line .= " — $pkg";
        if ($cost) $line .= " (₪$cost לשנה)";
        if ($ds)   $line .= " | $ds";
        if ($sim)  $line .= "\n      SIM: $sim";
        $out .= $line . "\n";
    }
    return $out;
}

// ── לוגיקה ראשית ─────────────────────────────────────────────
function handleMessage($phone, $text) {
    global $COMPANIES, $STATUSES;

    // 1. זיהוי החנות
    $resp = crmGet('checkUser', ['phone' => $phone]);
    if (!$resp || empty($resp['success']) || empty($resp['data'])) {
        return "❌ המספר $phone לא מזוהה במערכת כחנות.";
    }

    $data    = $resp['data'];
    $user    = $data['user']  ?? [];
    $deals   = $data['deals'] ?? [];
    $storeId = $user['id']    ?? null;
    $name    = $user['name']  ?? 'חנות';
    $city    = $user['city']  ?? '';

    // ── באיזו חברה מספר מסוים? ──────────────────────────────
    if (contains($text, ['באיזו חברה', 'איזה חברה', 'איזו חברה', 'checkprovider', 'ספק', 'באיזה ספק'])) {
        // חלץ מספר מהטקסט
        preg_match('/05\d{8}/', $text, $m);
        $qphone = $m[0] ?? $phone;
        $r = crmGet('checkProvider', ['phone' => $qphone]);
        if ($r && !empty($r['data'])) {
            $d   = $r['data'];
            $cid = $d['provider_id'] ?? $d['company_id'] ?? null;
            $cn  = $cid ? ($COMPANIES[$cid] ?? "חברה $cid") : ($d['provider'] ?? $d['company'] ?? '');
            if ($cn) return "📡 המספר $qphone נמצא ב-**$cn**.";
        }
        // לא נמצא — חפש בעסקאות
        foreach ($deals as $d) {
            foreach (($d['details'] ?? []) as $det) {
                if (($det['tel_number'] ?? '') === $qphone) {
                    $cid = $d['company']['id'] ?? null;
                    $cn  = $cid ? ($COMPANIES[$cid] ?? '') : ($d['company']['name'] ?? '');
                    return "📡 המספר $qphone נמצא ב-**$cn** (לפי עסקאות החנות).";
                }
            }
        }
        return "לא הצלחתי לאתר את החברה של המספר $qphone.";
    }

    // ── חיפוש עסקה ספציפית ──────────────────────────────────
    if (contains($text, ['עסקה של', 'מה קורה עם', 'סטטוס של', 'עדכון על', 'מצב של', 'מה הסטטוס'])) {
        // חלץ שם/מספר מהטקסט
        $q = preg_replace('/.*?(עסקה של|מה קורה עם|סטטוס של|עדכון על|מצב של|מה הסטטוס של?)\s*/u', '', $text);
        $q = trim($q, '? ');

        // חפש קודם ב-deals שכבר יש
        $found = [];
        foreach ($deals as $d) {
            $haystack = strtolower(($d['name'] ?? '') . ' ' . ($d['passport'] ?? '') . ' ' . ($d['cphone1'] ?? ''));
            if ($q && strpos($haystack, strtolower($q)) !== false) {
                $found[] = $d;
            }
        }

        // אם לא נמצא מקומית — שאל API deals עם q
        if (empty($found) && $storeId && $q) {
            $r = crmGet('deals', ['id' => $storeId, 'q' => $q]);
            $found = $r['data'] ?? [];
        }

        if (empty($found)) {
            return "לא מצאתי עסקה עבור \"$q\".";
        }
        $out = "🔍 תוצאות חיפוש עבור \"$q\":\n\n";
        foreach (array_slice($found, 0, 5) as $d) {
            $out .= dealToText($d, $COMPANIES, $STATUSES) . "\n";
        }
        return $out;
    }

    // ── חבילות ──────────────────────────────────────────────
    if (contains($text, ['חבילה', 'חבילות', 'מחיר', 'כמה עולה', 'מה יש להציע', 'מה אפשר להציע', 'מה להציע'])) {
        $r = crmGet('get-packages');
        $pkgs = $r['data']['packages'] ?? $r['data'] ?? [];
        if (empty($pkgs)) {
            // נסה packagesByBiz
            $r2 = crmGet('packagesByBiz');
            $pkgs = $r2['data'] ?? [];
        }
        if (empty($pkgs)) return "לא נמצאו חבילות כרגע.";

        $out = "📦 **חבילות זמינות:**\n\n";
        foreach (array_slice($pkgs, 0, 12) as $p) {
            $pname  = $p['name']  ?? $p['title'] ?? '';
            $cost   = $p['cost']  ?? '';
            $cid    = $p['company_id'] ?? ($p['company']['id'] ?? null);
            $cname  = $cid ? ($COMPANIES[$cid] ?? '') : ($p['company']['name'] ?? '');
            $out .= "• $pname";
            if ($cost)  $out .= " — ₪$cost לשנה";
            if ($cname) $out .= " ($cname)";
            $out .= "\n";
        }
        return $out;
    }

    // ── כל העסקאות ──────────────────────────────────────────
    if (contains($text, ['עסקאות', 'עסקה', 'סטטוס', 'מה קורה', 'מה יש', 'רשימה', 'היי', 'שלום', 'הי', 'hi', 'hello', 'מה נשמע'])) {
        if (empty($deals)) {
            return "📋 **$name** — אין עסקאות פתוחות כרגע.";
        }
        $out = "📋 **עסקאות של $name**";
        if ($city) $out .= " | $city";
        $out .= " (" . count($deals) . " עסקאות):\n\n";
        foreach ($deals as $d) {
            $out .= dealToText($d, $COMPANIES, $STATUSES) . "\n";
        }
        return $out;
    }

    // ── ברירת מחדל — פרטי חנות ──────────────────────────────
    $cnt = count($deals);
    $out  = "🏪 **$name**";
    if ($city) $out .= " | $city";
    $out .= "\n";
    $out .= "📱 " . ($user['phone'] ?? $phone) . "\n";
    if (!empty($user['email'])) $out .= "✉️ " . $user['email'] . "\n";
    $out .= "\nיש $cnt עסקאות.\n\n";
    $out .= "מה תרצה לדעת?\n";
    $out .= "• **עסקאות** — כל העסקאות והסטטוסים\n";
    $out .= "• **באיזו חברה 05XXXXXXXX** — בדוק חברה לפי מספר\n";
    $out .= "• **עסקה של [שם]** — חפש עסקה ספציפית\n";
    $out .= "• **חבילות** — חבילות ומחירים";
    return $out;
}

// ── POST handler ─────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $body  = json_decode(file_get_contents('php://input'), true);
    $phone = preg_replace('/\D/', '', $body['phone'] ?? '');
    $text  = trim($body['message'] ?? '');
    if (!$phone || !$text) {
        echo json_encode(['reply' => 'שגיאה: חסר מספר או הודעה.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $reply = handleMessage($phone, $text);
    echo json_encode(['reply' => $reply], JSON_UNESCAPED_UNICODE);
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
  .container { width: 100%; max-width: 540px; height: 100vh; display: flex; flex-direction: column; background: #fff; box-shadow: 0 0 20px rgba(0,0,0,.15); }
  .header { background: #075e54; color: #fff; padding: 14px 20px; display: flex; align-items: center; gap: 12px; }
  .avatar { width: 42px; height: 42px; border-radius: 50%; background: #25d366; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
  .info h2 { font-size: 16px; }
  .info p  { font-size: 12px; opacity: .8; }
  .phone-bar { background: #f5f5f5; padding: 8px 16px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #e0e0e0; }
  .phone-bar label { font-size: 13px; color: #555; white-space: nowrap; }
  .phone-bar input { flex: 1; border: 1px solid #ccc; border-radius: 20px; padding: 5px 12px; font-size: 14px; outline: none; direction: ltr; }
  .messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; background: #e5ddd5; }
  .bubble { max-width: 88%; padding: 9px 13px; border-radius: 8px; font-size: 14px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
  .bubble.user { background: #dcf8c6; align-self: flex-end; border-bottom-left-radius: 0; }
  .bubble.bot  { background: #fff; align-self: flex-start; border-bottom-right-radius: 0; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
  .typing { font-size: 12px; color: #888; padding: 3px 16px; min-height: 18px; }
  .input-bar { padding: 10px 12px; background: #f0f0f0; display: flex; gap: 8px; align-items: flex-end; }
  .input-bar textarea { flex: 1; border: none; border-radius: 20px; padding: 10px 16px; font-size: 14px; resize: none; outline: none; max-height: 120px; font-family: Arial, sans-serif; line-height: 1.4; }
  .input-bar button { background: #075e54; color: #fff; border: none; border-radius: 50%; width: 46px; height: 46px; font-size: 20px; cursor: pointer; flex-shrink: 0; }
  .input-bar button:hover { background: #128c7e; }
  .hint { background: #fffde7; border-right: 3px solid #f9a825; padding: 8px 12px; font-size: 12px; color: #555; line-height: 1.6; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="avatar">🤖</div>
    <div class="info"><h2>בוט אול אין</h2><p>מחובר ל-CRM ideali</p></div>
  </div>
  <div class="phone-bar">
    <label>📱 מספר חנות:</label>
    <input type="tel" id="phone" value="0544951010">
  </div>
  <div class="messages" id="messages">
    <div class="bubble bot">שלום! אני הבוט של אול אין 👋<br><br>אני יכול לעזור לך עם:<br>• <b>עסקאות</b> — כל העסקאות והסטטוסים<br>• <b>עסקה של [שם]</b> — חפש עסקה ספציפית<br>• <b>באיזו חברה 05XXXXXXXX</b> — בדוק חברה לפי מספר<br>• <b>חבילות</b> — חבילות ומחירים<br><br>פשוט כתוב מה תרצה לדעת!</div>
  </div>
  <div class="typing" id="typing"></div>
  <div class="input-bar">
    <textarea id="msg" rows="1" placeholder="כתוב הודעה..."></textarea>
    <button onclick="send()" title="שלח">➤</button>
  </div>
</div>
<script>
function addBubble(text, who) {
  const d = document.getElementById('messages');
  const b = document.createElement('div');
  b.className = 'bubble ' + who;
  // המרת markdown בסיסי
  let html = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>');
  b.innerHTML = html;
  d.appendChild(b);
  d.scrollTop = d.scrollHeight;
}

async function send() {
  const msg   = document.getElementById('msg').value.trim();
  const phone = document.getElementById('phone').value.trim();
  if (!msg || !phone) return;
  addBubble(msg, 'user');
  document.getElementById('msg').value = '';
  document.getElementById('typing').textContent = 'הבוט מקליד...';
  try {
    const res  = await fetch('', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({phone, message: msg}) });
    const data = await res.json();
    addBubble(data.reply || 'אין תגובה', 'bot');
  } catch(e) {
    addBubble('שגיאת תקשורת 😕', 'bot');
  }
  document.getElementById('typing').textContent = '';
}

document.getElementById('msg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
</script>
</body>
</html>
