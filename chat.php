<?php
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

define('CRM_BASE',    'https://crm.ideali.co.il/api/aibot');
define('CRM_TOKEN',   'jkFGD78dfgDj8797gsjkh8fdgdf');
define('CLAUDE_KEY',  implode('', ['sk-ant-api03-bAWcn9HGKOd-EVNzLiotPxWvTPxKmn9', 'WCnqkhqB6BOvqojXJOCPtDUVoCpqEy4VWCJjbVEpZV8IwcqSmPpRqng-3SpDHQAA']));
define('CLAUDE_MODEL','claude-haiku-4-5-20251001');

$COMPANIES = [1=>'סלקום',2=>'פרטנר',4=>'פלאפון',5=>'גולן טלקום',6=>'הוט מובייל',12=>'wecom'];
$STATUSES  = [
    'OPEN'=>'פתוחה — טרם טופלה',
    'PROCESS_SHOP'=>'דורש טיפול מהחנות',
    'WAITING_CONNECT'=>'ממתין לחיבור',
    'CONN_NOT_NIY'=>'חובר — הניוד לא הושלם',
    'NIYUD_ACTIVATED'=>'הניוד יצא לדרך',
    'DONE'=>'הושלמה בהצלחה',
    'CANCELLED'=>'מבוטלת',
    'ROBOT_ERROR_SYS'=>'שגיאת מערכת',
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

function callClaude($systemPrompt, $messages) {
    $payload = json_encode([
        'model'      => CLAUDE_MODEL,
        'max_tokens' => 1024,
        'system'     => $systemPrompt,
        'messages'   => $messages,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'x-api-key: '.CLAUDE_KEY,
        'anthropic-version: 2023-06-01',
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) return 'ERR_CURL:'.$err;
    if (!$res) return 'ERR_EMPTY_RESPONSE';

    $data = json_decode($res, true);
    if (isset($data['content'][0]['text'])) {
        return $data['content'][0]['text'];
    }
    return 'ERR_API:'.substr($res, 0, 300);
}

function buildDealsContext($deals, $COMPANIES, $STATUSES) {
    if (empty($deals)) return "אין עסקאות פתוחות.";
    $out = "";
    foreach ($deals as $d) {
        $cname = $d['company']['name'] ?? ($COMPANIES[$d['company']['id']??0]??'');
        $suid  = $d['status']['uid']  ?? '';
        $sname = $STATUSES[$suid]     ?? ($d['status']['name'] ?? '');
        $cust  = $d['name']           ?? '';
        $pid   = $d['passport']       ?? '';
        $phone = $d['cphone1']        ?? '';
        $date  = substr($d['created_at']??'',0,10);
        $out  .= "- עסקה #{$d['id']}: לקוח={$cust}, ת\"ז={$pid}, טלפון={$phone}, חברה={$cname}, סטטוס={$sname}, תאריך={$date}\n";
        foreach (($d['details']??[]) as $det) {
            $tel  = $det['tel_number']??'';
            $pkg  = $det['package_raw']['name']??'';
            $cost = $det['package_raw']['cost']??'';
            $ds   = $det['status']['name']??'';
            $out .= "  קו: {$tel}, חבילה: {$pkg} ₪{$cost}, סטטוס קו: {$ds}\n";
        }
    }
    return $out;
}

if ($_SERVER['REQUEST_METHOD']==='POST') {
    ob_clean();
    header('Content-Type: application/json; charset=utf-8');

    try {
        $body    = json_decode(file_get_contents('php://input'), true);
        $phone   = preg_replace('/\D/','', $body['phone']  ?? '');
        $text    = trim($body['message'] ?? '');
        $history = $body['history'] ?? [];

        if (!$phone || !$text) {
            echo json_encode(['reply'=>'שגיאה: חסר מספר או הודעה.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $resp = crmGet('checkUser', ['phone'=>$phone]);
        if (!$resp || empty($resp['success']) || empty($resp['data'])) {
            echo json_encode(['reply'=>"המספר {$phone} לא מזוהה במערכת."], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $data    = $resp['data'];
        $user    = $data['user']  ?? [];
        $deals   = $data['deals'] ?? [];
        $name    = $user['name']  ?? 'חנות';
        $city    = $user['city']  ?? '';

        // בדיקת מפעיל — אם יש מספר טלפון בהודעה, בדוק תמיד
        $providerCtx = '';
        preg_match_all('/05\d{8}/', $text, $phoneMatches);
        $phonesToCheck = array_unique($phoneMatches[0] ?? []);
        foreach ($phonesToCheck as $checkPhone) {
            $pr = crmGet('checkProvider', ['phone'=>$checkPhone]);
            if (!empty($pr['data'])) {
                $providerCtx .= "=== מפעיל למספר {$checkPhone} ===\n".json_encode($pr['data'], JSON_UNESCAPED_UNICODE)."\n";
            } else {
                $providerCtx .= "=== מפעיל למספר {$checkPhone} ===\nלא נמצא מידע\n";
            }
        }
        $system2 = $providerCtx;

        // תמיד טוען חבילות — Claude יחליט מה רלוונטי
        $packagesCtx  = '';
        $r = crmGet('get-packages');
        $pkgs = [];
        if (!empty($r['data']['packages']) && is_array($r['data']['packages'])) {
            $pkgs = $r['data']['packages'];
        } elseif (!empty($r['data']) && is_array($r['data'])) {
            $pkgs = $r['data'];
        } elseif (!empty($r['packages']) && is_array($r['packages'])) {
            $pkgs = $r['packages'];
        } elseif (!empty($r) && is_array($r)) {
            foreach ($r as $item) {
                if (is_array($item) && isset($item['name'])) { $pkgs = $r; break; }
            }
        }
        if (!empty($pkgs)) {
            foreach (array_slice($pkgs, 0, 30) as $p) {
                if (!is_array($p)) continue;
                $pname = $p['name'] ?? '';
                $pcost = $p['cost'] ?? $p['price'] ?? '';
                $cid   = $p['company_id'] ?? ($p['company']['id'] ?? 0);
                $cname = $COMPANIES[$cid] ?? ($p['company']['name'] ?? '');
                $pgb   = $p['gb'] ?? $p['data'] ?? '';
                $extra = $pgb ? " | {$pgb}GB" : '';
                $packagesCtx .= "- {$pname}{$extra} | {$pcost} ש\"ח | {$cname}\n";
            }
        }

        $dealsCtx = buildDealsContext($deals, $COMPANIES, $STATUSES);

        $system  = "אתה בוט תפעול פנימי של חברת אול אין — רשת חנויות סלולר.\n";
        $system .= "אתה מדבר עם נציג החנות: {$name}, עיר: {$city}, טלפון: {$phone}\n\n";
        $system .= "=== חשוב מאוד — זהות המשתמש ===\n";
        $system .= "אתה מדבר עם נציג החנות בלבד — לא עם לקוח קצה.\n";
        $system .= "הנציג הוא עובד חנות של אול אין שמתכתב איתך לגבי עסקאות של החנות שלו.\n";
        $system .= "הנציג שואל שאלות תפעוליות: סטטוס עסקה, בדיקת מפעיל, מחירי חבילות.\n";
        $system .= "לקוחות קצה אינם מתכתבים כאן ואינם מקבלים שירות דרך בוט זה.\n\n";
        $system .= "=== עסקאות החנות ===\n{$dealsCtx}\n";
        if ($packagesCtx) $system .= "=== חבילות זמינות ===\n{$packagesCtx}\n";
        if (!empty($system2)) $system .= "\n".$system2;
        $system .= "\n=== כללי תגובה ===\n";
        $system .= "1. תשובות קצרות וישירות — מקסימום 2-3 משפטים.\n";
        $system .= "2. כשנציג שואל על עסקה — תן סטטוס מיידי מה-CRM.\n";
        $system .= "3. כשנציג מבקש לזרז ('דחוף', 'הלקוח איתי') — הכר בדחיפות, תן סטטוס מיידי.\n";
        $system .= "4. מה הבוט יכול: בדיקת סטטוס עסקה, בדיקת מפעיל, הצגת חבילות ומחירים.\n";
        $system .= "5. מה דורש נציג אנושי: הפעלת ניוד, החלפת SIM, עדכון אשראי, עקיפת ניוד, שחרור חסימה — אמור 'פנה לתפעול'.\n";
        $system .= "6. הקמת עסקה חדשה — הנציג חייב להקים אותה במערכת CRM ישירות. אמור 'יש להקים עסקה במערכת'.\n";
        $system .= "7. אם שולחים כמה מספרי טלפון לבדיקת מפעיל — בדוק כל אחד בנפרד.\n";
        $system .= "8. סטטוסים: DONE=הושלם, WAITING_CONNECT=ממתין לחיבור, CONN_NOT_NIY=חובר אך ניוד לא הושלם, OPEN=פתוחה, NIYUD_ACTIVATED=ניוד יצא לדרך, CANCELLED=מבוטלת.\n";
        $system .= "9. היה חברותי ונעים — אבל קצר. הנציגים עסוקים.\n";
        $system .= "10. אם אין מידע — בקש שם לקוח או מספר עסקה.\n";
        $system .= "11. אל תציג JSON גולמי — תרגם תמיד לעברית.\n";
        $system .= "12. עקוב אחרי הנציג — אם הוא מחליף נושא, עבור איתו מיד. אל תדבק בנושא הקודם.\n";

        $messages = [];
        foreach ($history as $h) {
            if (!empty($h['role']) && !empty($h['content'])) {
                $messages[] = ['role'=>$h['role'], 'content'=>$h['content']];
            }
        }
        $messages[] = ['role'=>'user', 'content'=>$text];

        $reply = callClaude($system, $messages);

        echo json_encode(['reply'=>$reply], JSON_UNESCAPED_UNICODE);

    } catch (Throwable $e) {
        ob_clean();
        echo json_encode(['reply'=>'שגיאה: '.$e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
    exit;
}
?>
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>אול אין — בוט AI</title>
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
    <div class="info"><h2>בוט אול אין AI</h2><p>מופעל על ידי Claude AI</p></div>
  </div>
  <div class="phone-bar">
    <label>📱 מספר חנות:</label>
    <input type="tel" id="phone" value="0544951010">
  </div>
  <div class="messages" id="messages">
    <div class="bubble bot">שלום! 👋 אני הבוט החכם של אול אין, מופעל על ידי AI.<br>אני יכול לעזור עם עסקאות, סטטוסים, חבילות ועוד.<br>מה אפשר לעשות בשבילך?</div>
  </div>
  <div class="typing" id="typing"></div>
  <div class="input-bar">
    <textarea id="msg" rows="1" placeholder="כתוב הודעה..."></textarea>
    <button onclick="send()">➤</button>
  </div>
</div>
<script>
let history = [];

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
  history.push({role:'user', content: msg});
  document.getElementById('msg').value = '';
  document.getElementById('typing').textContent = 'הבוט מקליד...';

  try {
    const res  = await fetch('', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({phone, message: msg, history: history.slice(-10)})
    });
    const data = await res.json();
    const reply = data.reply || 'אין תגובה';
    addBubble(reply, 'bot');
    history.push({role:'assistant', content: reply});
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
