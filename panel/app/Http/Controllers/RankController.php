<?php

namespace App\Http\Controllers;

use App\Models\BotUser;
use Illuminate\Support\Facades\DB;

class RankController extends Controller
{
    public function index()
    {
        $top = DB::table('scores')
            ->select('jid', DB::raw('SUM(points) as s'))
            ->groupBy('jid')->orderByDesc('s')->limit(20)->get();
        $users = BotUser::whereIn('jid', $top->pluck('jid'))->get()->keyBy('jid');
        return view('rank', compact('top', 'users'));
    }
}
