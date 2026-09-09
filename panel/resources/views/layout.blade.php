<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WA Panel - @yield('title','Dashboard')</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#f4f6f8;color:#222}
nav{background:#16a34a;color:#fff;padding:10px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
nav a{color:#fff;text-decoration:none;font-weight:600}
nav a:hover{text-decoration:underline}
main{max-width:900px;margin:20px auto;padding:0 16px}
.card{background:#fff;border-radius:10px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px #0001}
.ok{background:#dcfce7;padding:8px 12px;border-radius:8px;margin-bottom:12px}
.err{background:#fee2e2;padding:8px 12px;border-radius:8px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
td,th{border-bottom:1px solid #eee;padding:8px;text-align:left}
input,select,textarea{padding:8px;border:1px solid #ccc;border-radius:6px;width:100%;box-sizing:border-box}
button{background:#16a34a;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600}
button:hover{background:#15803d}
.row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1;min-width:140px}
.badge{padding:2px 8px;border-radius:10px;font-size:12px}.on{background:#dcfce7}.off{background:#fee2e2}
form.inline{display:inline}
</style>
</head>
<body>
<nav>
<b>🤖 WA Panel</b>
<a href="/">Dashboard</a><a href="/koneksi">Koneksi</a><a href="/grup">Grup</a>
<a href="/toko">Toko</a><a href="/broadcast">Broadcast</a><a href="/rank">Rank</a>
<span style="flex:1"></span>
<span>{{ session('panel_admin') }}</span>
<form class="inline" method="POST" action="/logout">@csrf<button>Keluar</button></form>
</nav>
<main>
@if(session('ok'))<div class="ok">{{ session('ok') }}</div>@endif
@if($errors->any())<div class="err">{{ $errors->first() }}</div>@endif
@yield('content')
</main>
</body>
</html>
