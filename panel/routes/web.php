<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BroadcastController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GrupController;
use App\Http\Controllers\KoneksiController;
use App\Http\Controllers\RankController;
use App\Http\Controllers\TokoController;
use Illuminate\Support\Facades\Route;

Route::get('/login', [AuthController::class, 'loginForm']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout']);

Route::middleware('panel')->group(function () {
    Route::get('/', [DashboardController::class, 'index']);
    Route::get('/koneksi', [KoneksiController::class, 'index']);
    Route::get('/koneksi/qr', [KoneksiController::class, 'qr']);
    Route::get('/grup', [GrupController::class, 'index']);
    Route::post('/grup', [GrupController::class, 'save']);
    Route::get('/toko', [TokoController::class, 'index']);
    Route::post('/toko/produk', [TokoController::class, 'storeProduct']);
    Route::post('/toko/produk/{product}/stok', [TokoController::class, 'updateStock']);
    Route::post('/toko/produk/{product}/hapus', [TokoController::class, 'deleteProduct']);
    Route::post('/toko/order/{order}/status', [TokoController::class, 'setOrder']);
    Route::get('/broadcast', [BroadcastController::class, 'index']);
    Route::post('/broadcast', [BroadcastController::class, 'store']);
    Route::post('/kirim', [BroadcastController::class, 'sendNow']);
    Route::get('/rank', [RankController::class, 'index']);
});
