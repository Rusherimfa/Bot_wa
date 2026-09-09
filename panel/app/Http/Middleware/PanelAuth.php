<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class PanelAuth
{
    public function handle(Request $request, Closure $next)
    {
        if (! session('panel_admin')) return redirect('/login');
        return $next($request);
    }
}
