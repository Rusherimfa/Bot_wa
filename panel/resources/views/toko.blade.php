@extends('layout')
@section('title','Toko')
@section('content')
<div class="card">
<h3>Omset: Rp{{ number_format($omset) }} ({{ $orders->count() }} order terakhir)</h3>
</div>
<div class="card">
<h3>Tambah produk</h3>
<form method="POST" action="/toko/produk">@csrf
<div class="row">
<div><input name="name" placeholder="Nama" required></div>
<div><input name="price" type="number" placeholder="Harga" required></div>
<div><input name="stock" type="number" placeholder="Stok" value="0"></div>
<div><button>Tambah</button></div>
</div></form>
</div>
<div class="card">
<h3>Produk</h3>
<table><tr><th>ID</th><th>Nama</th><th>Harga</th><th>Stok</th><th></th></tr>
@foreach($products as $p)
<tr><td>{{ $p->id }}</td><td>{{ $p->name }}</td><td>Rp{{ number_format($p->price) }}</td>
<td><form class="inline" method="POST" action="/toko/produk/{{ $p->id }}/stok">@csrf
<input name="stock" type="number" value="{{ $p->stock }}" style="width:80px"><button>OK</button></form></td>
<td><form class="inline" method="POST" action="/toko/produk/{{ $p->id }}/hapus" onsubmit="return confirm('Hapus?')">@csrf<button>Hapus</button></form></td></tr>
@endforeach</table>
</div>
<div class="card">
<h3>Order masuk</h3>
<table><tr><th>ID</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr>
@foreach($orders as $o)
<tr><td>{{ $o->id }}</td><td>{{ explode('@',$o->customer)[0] }}</td><td>Rp{{ number_format($o->total) }}</td><td>{{ $o->status }}</td>
<td><form class="inline" method="POST" action="/toko/order/{{ $o->id }}/status">@csrf
<select name="status"><option>pending</option><option>lunas</option><option>batal</option></select><button>OK</button></form></td></tr>
@endforeach</table>
</div>
@endsection
