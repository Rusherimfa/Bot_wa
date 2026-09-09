<?php

namespace App\Http\Controllers;

use App\Models\Broadcast;
use App\Models\GroupSetting;
use App\Services\WaBot;
use Illuminate\Http\Request;

class BroadcastController extends Controller
{
    public function index()
    {
        return view('broadcast', [
            'list' => Broadcast::orderByDesc('id')->limit(20)->get(),
            'groups' => GroupSetting::orderBy('jid')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $request->validate(['targets' => 'required|array|min:1', 'body' => 'required|max:2000', 'run_at' => 'nullable|date']);
        Broadcast::create([
            'targets' => array_values($request->targets),
            'body' => $request->body,
            'run_at' => $request->run_at ?: now(),
        ]);
        return back()->with('ok', 'Broadcast dijadwalkan. Terkirim otomatis max 5/menit (anti-ban).');
    }

    public function sendNow(Request $request)
    {
        $request->validate(['jid' => 'required', 'text' => 'required|max:2000']);
        return back()->with('ok', WaBot::send($request->jid, $request->text) ? 'Pesan dikirim via bot.' : 'Gagal — bot offline?');
    }
}
