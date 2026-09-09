<?php

namespace App\Http\Controllers;

use App\Services\WaBot;

class KoneksiController extends Controller
{
    public function index()
    {
        return view('koneksi', ['wa' => WaBot::status()]);
    }

    public function qr()
    {
        $png = WaBot::qrPng();
        if (! $png) abort(404, 'QR tidak tersedia (bot sudah connect atau offline)');
        return response($png)->header('Content-Type', 'image/png');
    }
}
