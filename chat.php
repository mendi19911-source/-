<?php
ob_start();
error_reporting(0);
ini_set('display_errors', 0);

define('CRM_BASE',    'https://crm.ideali.co.il/api/aibot');
define('CRM_TOKEN',   'jkFGD78dfgDj8797gsjkh8fdgdf');
define('CLAUDE_KEY',  getenv('CLAUDE_KEY') ?: (file_exists(dirname(__FILE__).DIRECTORY_SEPARATOR.'claude_key.txt') ? trim(file_get_contents(dirname(__FILE__).DIRECTORY_SEPARATOR.'claude_key.txt')) : 'PASTE_YOUR_KEY_HERE'));
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

// ── CRM ───────────────────────────────────────────────────────
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

// ── Claude API ────────────────────────────────────────────────
function callClaude($systemPrompt, $messages) {
    $payload = json_encode([
        'model'      => CLAUDE_MODEL,
        'max_tokens' => 1024,
        'system'     => $systemPrompt,
        'messages'   => $messages,
    ]);
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'x-api-key: '.CLAUDE_KEY,
        'anthropic-version: 2023-06-01',
    ]);
    $res  = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) return null;
    $data = json_decode($res, true);
    return $data['content'][0]['text'] ?? null;
}

// ── בנה תקציר עסקאות לקונטקסט ────────────────────────────────
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
        $body     = json_decode(file_get_contents('php://input'), true);
        $phone    = preg_replace('/\D/','', $body['phone']  ?? '');
        $text     = trim($body['message'] ?? '');
        $history  = $body['history'] ?? []; // היסטוריית שיחה מהדפדפן

        if (!$phone || !$text) {
            echo json_encode(['reply'=>'שגיאה: חסר מספר או הודעה.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // זיהוי חנות
        $resp = crmGet('checkUser', ['phone'=>$phone]);
        if (!$resp || empty($resp['success']) || empty($resp['data'])) {
            echo json_encode(['reply'=>"❌ המספר {$phone} לא מזוהה במערכת."], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $data    = $resp['data'];
        $user    = $data['user']  ?? [];
        $deals   = $data['deals'] ?? [];
        $storeId = $user['id']    ?? null;
        $name    = $user['name']  ?? 'חנות';
        $city    = $user['city']  ?? '';

        // בדיקה אם צריך חבילות
        $needPackages = preg_match('/חבילה|חבילות|מחיר|כמה עולה|להציע/u', $text);
        $packagesCtx  = '';
        if ($needPackages) {
            $r    = crmGet('get-packages');
            $pkgs = $r['data']['packages'] ?? $r['data'] ?? [];
            if (!empty($pkgs) && is_array($pkgs)) {
                foreach (array_slice($pkgs,0,15) as $p) {
                    $pname = $p['name']??'';
                    $cost  = $p['cost']??'';
                    $cid   = $p['company_id']??($p['company']['id']??0);
                    global $COMPANIES;
                    $cname = $COMPANIES[$cid] ?? ($p['company']['name']??'');
                    $packagesCtx .= "- {$pname} | ₪{$cost} לשנה | {$cname}\n";
                }
            }
        }

        // System prompt
        $dealsCtx = buildDealsContext($deals, $COMPANIES, $STATUSES);
        $system = <<<PROMPT
אתה בוט שירות לקוחות של חברת "אול אין" — רשת חנויות סלולר.
אתה מדבר עם נציג החנות בשם: {$name}
עיר: {$city}
מספר טלפון החנות: {$phone}

המידע הנוכחי ממערכת ה-CRM:
=== עסקאות החנות ===
{$dealsCtx}
PROMPT;

        if ($packagesCtx) {
            $system .= "\n=== חבילות זמינות ===\n{$packagesCtx}";
        }

        $system .= <<<PROMPT

=== הנחיות ===
1. ענה תמיד בעברית, בטון חברותי ואנושי — כמו נציג אנושי בוואטסאפ.
2. משפטים קצרים, לא נאומים. מקסימום 3-4 משפטים בכל תגובה.
3. אם שואלים על עסקה — חפש בנתוני ה-CRM שסופקו לך ותן תשובה ספציפית.
4. תרגם סטטוסים לעברית פשוטה (לדוגמה: DONE = הושלם, WAITING_CONNECT = ממתין לחיבור).
5. אם אין לך מידע — אמור זאת בנימוס ובקש פרטים נוספים.
6. תמיד נסה להבין מה הבעיה האמיתית של הנציג ולעזור לו לפתור אותה.
7. בסוף תגובה שבה ענית — שאל שאלה קצרה אחת להמשך.
8. אל תציג נתוני JSON גולמיים — תרגם לעברית ברורה.
9. מותר לספר בדיחה קצרה או להיות קצת עליז — אבל תמיד חזור לעניין.
PROMPT;

        // בנה הודעות לקלוד
        $messages = [];
        foreach ($history as $h) {
            if (!empty($h['role']) && !empty($h['content'])) {
                $messages[] = ['role'=>$h['role'], 'content'=>$h['content']];
            }
        }
        $messages[] = ['role'=>'user', 'content'=>$text];

        // קרא לקלוד
        $reply = callClaude($system, $messages);

        if (!$reply) {
            $reply = "סליחה, יש לי בעיה טכנית רגעית 😅 נסה שוב.";
        }

        echo json_encode(['reply'=>$reply], JSON_UNESCAPED_UNICODE);

    } catch (Throwable $e) {
        ob_clean();
        echo json_encode(['reply'=>'שגיאה טכנית: '.$e->getMessage()], JSON_UNESCAPED_UNICODE);
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
