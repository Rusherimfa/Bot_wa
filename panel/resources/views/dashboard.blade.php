@extends('layout')
@section('title','Dashboard')
@section('content')
<div class="card">
<h3>Status WhatsApp</h3>
@if($wa && $wa['connected'])
<p><span class="badge on">● CONNECTED</span> {{ $wa['user'] ?? '' }}</p>
@else
<p><span class="badge off">● {{ $wa ? 'TERPUTUS' : 'BOT OFFLINE' }}</span>
<a href="/koneksi">buka halaman Koneksi</a></p>
@endif
</div>
<div class="row">
<div class="card"><h2>{{ $users }}</h2><p>User game</p></div>
<div class="card"><h2>{{ $products }}</h2><p>Produk</p></div>
<div class="card"><h2>{{ $orders }}</h2><p>Order</p></div>
<div class="card"><h2>Rp{{ number_format($omset) }}</h2><p>Omset</p></div>
</div>
@endsection
