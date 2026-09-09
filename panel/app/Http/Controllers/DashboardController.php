<?php

namespace App\Http\Controllers;

use App\Models\BotUser;
use App\Models\GroupSetting;
use App\Models\Order;
use App\Models\Product;
use App\Services\WaBot;

class DashboardController extends Controller
{
    public function index()
    {
        return view('dashboard', [
            'wa' => WaBot::status(),
            'users' => BotUser::count(),
            'products' => Product::count(),
            'orders' => Order::count(),
            'omset' => (int) Order::sum('total'),
            'groups' => GroupSetting::count(),
        ]);
    }
}
