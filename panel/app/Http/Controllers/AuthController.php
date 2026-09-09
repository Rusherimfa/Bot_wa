<?php

namespace App\Http\Controllers;

use App\Models\PanelAdmin;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function loginForm()
    {
        if (session('panel_admin')) return redirect('/');
        return view('login');
    }

    public function login(Request $request)
    {
        $request->validate(['username' => 'required', 'password' => 'required']);
        $admin = PanelAdmin::where('name', $request->username)->first();
        if ($admin && Hash::check($request->password, $admin->password)) {
            session(['panel_admin' => $admin->name]);
            return redirect('/');
        }
        return back()->withErrors(['login' => 'Username/password salah.']);
    }

    public function logout()
    {
        session()->forget('panel_admin');
        return redirect('/login');
    }

    public static function seedDefault(): void
    {
        if (PanelAdmin::count() === 0) {
            PanelAdmin::create([
                'name' => env('PANEL_ADMIN_USER', 'admin'),
                'password' => Hash::make(env('PANEL_ADMIN_PASS', 'admin123')),
            ]);
        }
    }
}
