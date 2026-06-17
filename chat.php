<?php
define('CRM_BASE', 'https://crm.ideali.co.il/api/aibot');
define('CRM_TOKEN', 'jkFGD78dfgDj8797gsjkh8fdgdf');

$COMPANIES = [1=>'סלקום',2=>'פרטנר',4=>'פלאפון',5=>'גולן טלקום',6=>'הוט מובייל',12=>'wecom'];
$STATUSES  = [
    'OPEN'=>'פתוחה — טרם טופלה',
    'PROCESS_SHOP'=>'דורש טיפול מהחנות',
    'WAITING_CONNECT'=>'ממתין לחיבור',
    'CONN_NOT_NIY'=>'חובר — הניוד לא הושלם',
    'NIYUD_ACTIVATED'=>'הניוד יצא לדרך',
    'DONE'=>'הושלמה בהצלחה ✅',
    'CANCELLED'=>'מבוטלת ❌',
    'ROBOT_ERROR_SYS'=>'שגיאת מערכת ⚠️',
];

function crmGet($endpoint, $extra=[]) {
    $p   = array_merge(['token'=>CRM_TOKEN], $extra);
    $url = CRM_BASE.'/'.$endpoint.'?'.http_build_query($p);
    $ch  = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $res = curl_exec($ch);
    curl_close($ch);
    return $res ? json_decode($res, true) : null;
}

function has($text, $words) {
    foreach ($words as $w) if (strpos($text,$w)!==false) return true;
    return false;
}

function dealText($d, $COMPANIES, $STATUSES) {
    $cname = $d['company']['name'] ?? ($COMPANIES[$d['company']['id']??0]??'');
    $suid  = $d['status']['uid']  ?? '';
    $sname = $STATUSES[$suid]     ?? ($d['status']['name'] ?? '');
    $cust  = $d['name']           ?? '';
    $out   = "מצאתי את העסקה של *{$cust}*";
    if ($cname) $out .= " בחברת {$cname}";
    $out  .= ".\nסטטוס: {$sname}";
    foreach (($d['details']??[]) as $det) {
        $tel  = $det['tel_number']??'';
        $pkg  = $det['package_raw']['name']??'';
        $cost = $det['package_raw']['cost']??'';
        $ds   = $det['status']['name']??'';
        $line = "\n📞 {$tel}";
        if ($pkg)  $line .= " — {$pkg}";
        if ($cost) $line .= " (₪{$cost})";
        if ($ds)   $line .= " | {$ds}";
        $out .= $line;
    }
    return $out;
}

if ($_SERVER['REQUEST_METHOD']==='POST') {
    header('Content-Type: application/json; charset=utf-8');

    $body  = json_decode(file_get_contents('php://input'), true);
    $phone = preg_replace('/\D/','', $body['phone']  ?? '');
    $text  = trim($body['message'] ?? '');
    $state = trim($body['state']   ?? 'idle'); // מצב שמגיע מהדפדפן

    if (!$phone || !$text) {
        echo json_encode(['reply'=>'שגיאה: חסר מספר או הודעה.','state'=>'idle'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    try {

    // זיהוי חנות
    $resp = crmGet('checkUser', ['phone'=>$phone]);
    if (!$resp || empty($resp['success']) || empty($resp['data'])) {
        echo json_encode(['reply'=>"❌ המספר {$phone} לא מזוהה במערכת.",'state'=>'idle'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data    = $resp['data'];
    $user    = $data['user']  ?? [];
    $deals   = $data['deals'] ?? [];
    $storeId = $user['id']    ?? null;
    $name    = $user['name']  ?? 'שלום';

    $reply    = '';
    $newState = 'idle';
    $extraData = [];

    // ── איפוס ──────────────────────────────────────────────
    if (has($text,['התחל מחדש','ביטול','בטל','reset','חזור','תפריט'])) {
        $reply = "בסדר! 😊 במה אפשר לעזור, {$name}?";
        $newState = 'idle';
    }

    // ── בדיקת חברה (מפעיל) ───────────────────────────────
    elseif (has($text,['באיזו חברה','איזה חברה','איזו חברה','ספק של','באיזה ספק','מפעיל','באיזה מפעיל','חברת תקשורת'])) {
        preg_match('/05\d{8}/',$text,$m);
        if (!$m) {
            $reply    = "בשמחה! 👍 איזה מספר תרצה לבדוק?";
            $newState = 'wait_provider';
        } else {
            $reply    = providerReply($m[0], $deals, $COMPANIES);
            $newState = 'idle';
        }
    }

    // ── ממתין למספר (checkProvider) ───────────────────────
    elseif ($state==='wait_provider') {
        preg_match('/05\d{8}/',$text,$m);
        $qphone    = $m[0] ?? preg_replace('/\D/','',$text);
        $reply     = providerReply($qphone, $deals, $COMPANIES);
        $reply    .= "\n\nרוצה גם לחפש עסקה על המספר הזה?";
        $newState  = 'wait_phone_intent';
        $extraData = ['lastPhone' => $qphone];
    }

    // ── מספר טלפון בלבד ───────────────────────────────────
    elseif (preg_match('/^05\d{8}$/', preg_replace('/\D/','',$text))) {
        $qphone = preg_replace('/\D/','',$text);
        if ($state==='wait_customer') {
            $reply    = searchDeal($qphone, $deals, $storeId, $COMPANIES, $STATUSES);
            $newState = 'deal_shown';
            $extraData = ['lastPhone' => $qphone];
        } else {
            $reply     = "קיבלתי את המספר {$qphone}. מה תרצה?\n• *עסקה* — לחפש עסקה\n• *חברה* — באיזו חברת תקשורת הוא נמצא";
            $newState  = 'wait_phone_intent';
            $extraData = ['lastPhone' => $qphone];
        }
    }

    // ── ממתין להחלטה על מספר ──────────────────────────────
    elseif ($state==='wait_phone_intent') {
        $qphone = $body['lastPhone'] ?? '';
        if (!$qphone) {
            $reply    = "לא זכרתי את המספר 😅 תשלח אותו שוב?";
            $newState = 'idle';
        } elseif (has($text,['עסקה','עסקאות','לקוח','לחפש','כן','אכן','בבקשה'])) {
            $reply     = searchDeal($qphone, $deals, $storeId, $COMPANIES, $STATUSES);
            $newState  = 'deal_shown';
            $extraData = ['lastPhone' => $qphone];
        } elseif (has($text,['חברה','מפעיל','ספק','תקשורת'])) {
            $reply     = providerReply($qphone, $deals, $COMPANIES);
            $reply    .= "\n\nרוצה גם לחפש עסקה על המספר הזה?";
            $newState  = 'wait_phone_intent';
            $extraData = ['lastPhone' => $qphone];
        } elseif (has($text,['לא','לא תודה','סיום','בסדר'])) {
            $reply    = "בסדר! 😊 במה עוד אפשר לעזור?";
            $newState = 'idle';
        } else {
            $reply     = "לא הבנתי 😊 עבור המספר {$qphone} — תרצה *עסקה* או *חברת תקשורת*?";
            $newState  = 'wait_phone_intent';
            $extraData = ['lastPhone' => $qphone];
        }
    }

    // ── חבילות ────────────────────────────────────────────
    elseif (has($text,['חבילה','חבילות','מחיר','כמה עולה','מה יש להציע','מה אפשר להציע'])) {
        $r    = crmGet('get-packages');
        $pkgs = $r['data']['packages'] ?? $r['data'] ?? [];
        if (empty($pkgs)) { $r2=crmGet('packagesByBiz'); $pkgs=$r2['data']??[]; }
        if (empty($pkgs)) {
            $reply = "לא נמצאו חבילות כרגע.";
        } else {
            $reply = "📦 הנה החבילות הזמינות:\n\n";
            foreach (array_slice($pkgs,0,10) as $p) {
                $pname=$p['name']??$p['title']??'';
                $cost=$p['cost']??'';
                $cid=$p['company_id']??($p['company']['id']??null);
                $cname=$cid?($COMPANIES[$cid]??''):($p['company']['name']??'');
                $reply .= "• {$pname}";
                if ($cost)  $reply .= " — ₪{$cost} לשנה";
                if ($cname) $reply .= " ({$cname})";
                $reply .= "\n";
            }
            $reply .= "\nרוצה פרטים על חבילה מסוימת?";
        }
        $newState = 'idle';
    }

    // ── פתיחת שיחה ────────────────────────────────────────
    elseif (has($text,['שלום','היי','הי','מה קורה','מה נשמע','בוקר טוב','ערב טוב','hi','hello','hey','yo'])) {
        $reply    = "שלום {$name}! 👋 איך אפשר לעזור?";
        $newState = 'idle';
    }

    // ── כוונה כללית לעסקה ─────────────────────────────────
    elseif (has($text,['עסקה','לקוח','לבדוק','סטטוס','עדכון','מה קורה עם','מצב'])) {
        // אולי יש כבר שם בטקסט?
        $noiseWords = ['עסקה של','מה קורה עם','סטטוס של','עדכון על','מצב של','לבדוק','הלקוח','לקוח','עסקה','סטטוס'];
        $q = $text;
        foreach ($noiseWords as $n) $q = str_ireplace($n,'',$q);
        $q = trim($q,' ?,.');
        if (strlen($q)>2 && !has($q,['עסקה','לקוח','בדוק'])) {
            $reply    = searchDeal($q,$deals,$storeId,$COMPANIES,$STATUSES);
            $newState = 'deal_shown';
        } else {
            $reply    = "בשמחה! 😊 על איזה לקוח מדובר? (שם או ת\"ז)";
            $newState = 'wait_customer';
        }
    }

    // ── ממתין לשם לקוח ────────────────────────────────────
    elseif ($state==='wait_customer') {
        $reply    = searchDeal($text,$deals,$storeId,$COMPANIES,$STATUSES);
        $newState = 'deal_shown';
    }

    // ── אחרי הצגת עסקה — הבן המשך שיחה ───────────────────
    elseif ($state==='deal_shown') {
        $qphone = $body['lastPhone'] ?? '';
        if (has($text,['עסקה','לקוח','לבדוק','סטטוס','אחר','עוד'])) {
            $reply    = "בשמחה! 😊 על איזה לקוח מדובר? (שם או ת\"ז)";
            $newState = 'wait_customer';
        } elseif (has($text,['חברה','מפעיל','ספק'])) {
            if ($qphone) {
                $reply    = providerReply($qphone, $deals, $COMPANIES);
                $newState = 'idle';
            } else {
                $reply    = "איזה מספר תרצה לבדוק?";
                $newState = 'wait_provider';
            }
        } else {
            $reply    = "רוצה לבדוק עוד משהו? 😊";
            $newState = 'idle';
        }
        if ($qphone) $extraData = ['lastPhone' => $qphone];
    }

    // ── ברירת מחדל ────────────────────────────────────────
    else {
        $reply    = "לא בדיוק הבנתי 😅 איך אפשר לעזור?\n• *עסקה* — לחפש לפי שם לקוח\n• *באיזו חברה 05XXXXXXXX* — לבדוק מפעיל\n• *חבילות* — מחירים וחבילות";
        $newState = 'idle';
    }

    if (!$reply) $reply = "לא הבנתי 😅 תוכל לנסח אחרת?";
    $out = ['reply'=>$reply, 'state'=>$newState];
    if (!empty($extraData)) $out = array_merge($out, $extraData);
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
} catch (Throwable $e) {
    echo json_encode(['reply'=>'משהו השתבש אצלי 😅 נסה שוב.','state'=>'idle'], JSON_UNESCAPED_UNICODE);
    exit;
}
}

function searchDeal($q,$deals,$storeId,$COMPANIES,$STATUSES) {
    $found = [];
    $ql    = strtolower(trim($q));

    // חפש קודם בעסקאות שכבר הגיעו מ-checkUser
    foreach ($deals as $d) {
        $hay = strtolower(($d['name']??'').' '.($d['passport']??'').' '.($d['cphone1']??''));
        if (strpos($hay,$ql)!==false) $found[]=$d;
    }

    // אם לא נמצא — קרא ל-API deals עם q
    if (empty($found) && $storeId) {
        $r     = crmGet('deals', ['id'=>$storeId, 'q'=>$q]);
        $found = $r['data'] ?? [];
    }

    if (empty($found)) {
        return "לא רואה כזאת עסקה במערכת 🔍\nבטוח שהעלת אותה? אולי יש שגיאה בשם?\nתוכל לנסות שוב עם שם אחר או ת\"ז.";
    }

    $out = dealText($found[0], $COMPANIES, $STATUSES);
    if (count($found)>1) $out .= "\n\n_(נמצאו ".count($found)." תוצאות — מציג את הראשונה)_";
    $out .= "\n\nאיך אפשר לעזור לך בעסקה הזו?";
    return $out;
}

function providerReply($qphone,$deals,$COMPANIES) {
    $r = crmGet('checkProvider', ['phone'=>$qphone]);
    if ($r && isset($r['data']) && $r['data'] !== null) {
        $d   = $r['data'];
        // נסה שדות שונים שה-API עשוי להחזיר
        $cid = $d['provider_id'] ?? $d['company_id'] ?? $d['operator_id'] ?? null;
        $cn  = '';
        if ($cid) $cn = $COMPANIES[$cid] ?? "חברה {$cid}";
        if (!$cn) $cn = $d['provider'] ?? $d['company'] ?? $d['operator'] ?? $d['name'] ?? '';
        if ($cn) return "📡 המספר {$qphone} נמצא ב-**{$cn}**.";
        // אם יש data אבל לא הצלחנו לחלץ שם — הצג את מה שיש
        $raw = json_encode($d, JSON_UNESCAPED_UNICODE);
        if ($raw && $raw !== '[]' && $raw !== '{}' && $raw !== 'null') {
            return "📡 תגובת המערכת עבור {$qphone}:\n{$raw}";
        }
    }
    // חפש בעסקאות של החנות
    foreach ($deals as $d) {
        foreach (($d['details']??[]) as $det) {
            if (($det['tel_number']??'')===$qphone) {
                $cid = $d['company']['id']??null;
                $cn  = $cid?($COMPANIES[$cid]??''):($d['company']['name']??'');
                return "📡 המספר {$qphone} נמצא ב-**{$cn}** (לפי עסקאות החנות).";
            }
        }
    }
    return "לא הצלחתי לאתר את חברת התקשורת של {$qphone}. ייתכן שהמספר לא במאגר. 🔍";
}
?>
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>אול אין — בוט CRM</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#e5ddd5;height:100vh;display:flex;align-items:center;justify-content:center}
  .container{width:100%;max-width:540px;height:100vh;display:flex;flex-direction:column;background:#fff;box-shadow:0 0 20px rgba(0,0,0,.15)}
  .header{background:#075e54;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px}
  .avatar{width:42px;height:42px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
  .info h2{font-size:16px}.info p{font-size:12px;opacity:.8}
  .phone-bar{background:#f5f5f5;padding:8px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #e0e0e0}
  .phone-bar label{font-size:13px;color:#555;white-space:nowrap}
  .phone-bar input{flex:1;border:1px solid #ccc;border-radius:20px;padding:5px 12px;font-size:14px;outline:none;direction:ltr}
  .messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#e5ddd5}
  .bubble{max-width:88%;padding:9px 13px;border-radius:8px;font-size:14px;line-height:1.65;white-space:pre-wrap;word-break:break-word}
  .bubble.user{background:#dcf8c6;align-self:flex-end;border-bottom-left-radius:0}
  .bubble.bot{background:#fff;align-self:flex-start;border-bottom-right-radius:0;box-shadow:0 1px 2px rgba(0,0,0,.1)}
  .typing{font-size:12px;color:#888;padding:3px 16px;min-height:18px}
  .input-bar{padding:10px 12px;background:#f0f0f0;display:flex;gap:8px;align-items:flex-end}
  .input-bar textarea{flex:1;border:none;border-radius:20px;padding:10px 16px;font-size:14px;resize:none;outline:none;max-height:120px;font-family:Arial,sans-serif}
  .input-bar button{background:#075e54;color:#fff;border:none;border-radius:50%;width:46px;height:46px;font-size:20px;cursor:pointer;flex-shrink:0}
  .input-bar button:hover{background:#128c7e}
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
    <div class="bubble bot">שלום! 👋 אני הבוט של אול אין. כתוב לי מה אתה צריך.</div>
  </div>
  <div class="typing" id="typing"></div>
  <div class="input-bar">
    <textarea id="msg" rows="1" placeholder="כתוב הודעה..."></textarea>
    <button onclick="send()">➤</button>
  </div>
</div>
<script>
let convState  = 'idle';
let lastPhone  = '';

function addBubble(text, who) {
  const d = document.getElementById('messages');
  const b = document.createElement('div');
  b.className = 'bubble ' + who;
  b.innerHTML = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>');
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
    const res  = await fetch('', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({phone, message: msg, state: convState, lastPhone})
    });
    const data = await res.json();
    convState = data.state  || 'idle';
    if (data.lastPhone) lastPhone = data.lastPhone;
    addBubble(data.reply || 'אין תגובה', 'bot');
  } catch(e) {
    addBubble('שגיאת תקשורת 😕', 'bot');
  }
  document.getElementById('typing').textContent = '';
}

document.getElementById('msg').addEventListener('keydown', e => {
  if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
</script>
</body>
</html>
