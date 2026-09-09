<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login - WA Panel</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;background:#f4f6f8;margin:0}
.box{background:#fff;padding:28px;border-radius:12px;box-shadow:0 2px 8px #0002;width:300px}
input{width:100%;padding:10px;margin:6px 0;border:1px solid #ccc;border-radius:6px;box-sizing:border-box}
button{width:100%;background:#16a34a;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:700;cursor:pointer}
.err{color:#b91c1c;font-size:14px}</style></head>
<body><div class="box">
<h2>🤖 WA Panel</h2>
@if($errors->any())<p class="err">{{ $errors->first() }}</p>@endif
<form method="POST" action="/login">@csrf
<input name="username" placeholder="Username" required>
<input name="password" type="password" placeholder="Password" required>
<button>Masuk</button></form>
</div></body></html>
