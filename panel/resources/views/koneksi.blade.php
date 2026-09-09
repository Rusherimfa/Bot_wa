@extends('layout')
@section('title','Koneksi')
@section('content')
<div class="card">
<h3>Koneksi WhatsApp</h3>
@if($wa && $wa['connected'])
<p><span class="badge on">● CONNECTED</span> {{ $wa['user'] ?? '' }}</p>
<p>Bot terhubung. Tidak perlu scan.</p>
@elseif($wa && $wa['qrAvailable'])
<p><span class="badge off">● BUTUH SCAN</span></p>
<p>Scan QR ini dari WA > Perangkat Tertaut (refresh tiap 20 dtk):</p>
<img src="/koneksi/qr?t={{ time() }}" width="300" style="border:1px solid #ddd;border-radius:8px">
<p><a href="/koneksi"><button type="button">Refresh QR</button></a></p>
@else
<p><span class="badge off">● BOT OFFLINE</span></p>
<p>Jalankan dulu: <code>cd ~/projects/wa-bot-full && npm run bot</code></p>
<p><a href="/koneksi"><button type="button">Coba lagi</button></a></p>
@endif
</div>
@endsection
