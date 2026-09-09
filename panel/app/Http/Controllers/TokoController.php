<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Request;

class TokoController extends Controller
{
    public function index()
    {
        return view('toko', [
            'products' => Product::orderBy('id')->get(),
            'orders' => Order::orderByDesc('id')->limit(50)->get(),
            'omset' => (int) Order::sum('total'),
        ]);
    }

    public function storeProduct(Request $request)
    {
        $request->validate(['name' => 'required', 'price' => 'required|integer|min:0', 'stock' => 'integer|min:0']);
        Product::create($request->only('name', 'price', 'stock'));
        return back()->with('ok', 'Produk ditambah.');
    }

    public function updateStock(Request $request, Product $product)
    {
        $request->validate(['stock' => 'required|integer|min:0']);
        $product->update(['stock' => $request->stock]);
        return back()->with('ok', 'Stok diperbarui.');
    }

    public function deleteProduct(Product $product)
    {
        $product->delete();
        return back()->with('ok', 'Produk dihapus.');
    }

    public function setOrder(Request $request, Order $order)
    {
        $request->validate(['status' => 'required|in:pending,lunas,batal']);
        $order->update(['status' => $request->status]);
        return back()->with('ok', "Order #{$order->id} -> {$request->status}.");
    }
}
