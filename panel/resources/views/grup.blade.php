@extends('layout')
@section('title','Grup')
@section('content')
<div class="card">
<h3>Tambah / ubah setting grup</h3>
<form method="POST" action="/grup">@csrf
<div class="row">
<div><input name="jid" placeholder="JID grup, mis. 120363xxx@g.us" required></div>
<div><select name="welcome"><option value="1">Welcome ON</option><option value="0">Welcome OFF</option></select></div>
<div><select name="antilink"><option value="1">Antilink ON</option><option value="0">Antilink OFF</option></select></div>
<div><button>Simpan</button></div>
</div></form>
<p><small>Lihat JID grup: aktifkan dulu bot, kirim pesan di grup, cek log terminal.</small></p>
</div>
<div class="card">
<h3>Grup terdaftar ({{ $groups->count() }})</h3>
<table><tr><th>JID</th><th>Welcome</th><th>Antilink</th></tr>
@foreach($groups as $g)
<tr><td>{{ $g->jid }}</td>
<td>{{ $g->welcome ? '✅' : '—' }}</td><td>{{ $g->antilink ? '✅' : '—' }}</td></tr>
@endforeach</table>
</div>
@endsection
