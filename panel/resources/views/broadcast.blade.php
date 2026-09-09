@extends('layout')
@section('title','Broadcast')
@section('content')
<div class="card">
<h3>Kirim cepat (1 pesan, via bot)</h3>
<form method="POST" action="/kirim">@csrf
<div class="row">
<div><input name="jid" placeholder="JID tujuan (user@g.us / 628x@s.whatsapp.net)" required></div>
</div>
<textarea name="text" rows="3" placeholder="Isi pesan" required style="margin-top:8px"></textarea>
<p><button>Kirim sekarang</button></p>
</form>
</div>
<div class="card">
<h3>Jadwalkan broadcast (max 5 target/menit, anti-ban)</h3>
<form method="POST" action="/broadcast">@csrf
<textarea name="body" rows="3" placeholder="Isi pesan" required></textarea>
<input name="targets[]" placeholder="JID target 1" required style="margin-top:8px">
<input name="targets[]" placeholder="JID target 2 (opsional)" style="margin-top:8px">
<input name="run_at" type="datetime-local" style="margin-top:8px">
<p><button>Jadwalkan</button></p>
</form>
</div>
<div class="card">
<h3>Riwayat</h3>
<table><tr><th>ID</th><th>Target</th><th>Pesan</th><th>Jadwal</th><th>Terkirim</th></tr>
@foreach($list as $b)
<tr><td>{{ $b->id }}</td><td>{{ count($b->targets ?? []) }} grup</td>
<td>{{ \Illuminate\Support\Str::limit($b->body,60) }}</td>
<td>{{ $b->run_at }}</td><td>{{ $b->sent ? '✅' : '⏳' }}</td></tr>
@endforeach</table>
</div>
@endsection
