<?php

namespace App\Http\Controllers;

use App\Models\GroupSetting;
use Illuminate\Http\Request;

class GrupController extends Controller
{
    public function index()
    {
        return view('grup', ['groups' => GroupSetting::orderBy('jid')->get()]);
    }

    public function save(Request $request)
    {
        $request->validate(['jid' => 'required']);
        GroupSetting::updateOrCreate(
            ['jid' => $request->jid],
            ['welcome' => $request->boolean('welcome'), 'antilink' => $request->boolean('antilink')]
        );
        return back()->with('ok', 'Setting grup disimpan.');
    }
}
