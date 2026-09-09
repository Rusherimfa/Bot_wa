@extends('layout')
@section('title','Rank')
@section('content')
<div class="card">
<h3>🏆 Leaderboard</h3>
<table><tr><th>#</th><th>User</th><th>Level/XP</th><th>Poin</th></tr>
@foreach($top as $i => $r)
<tr><td>{{ $i+1 }}</td><td>@{{ explode('@',$r->jid)[0] }} ({{ $users[$r->jid]->name ?? '-' }})</td>
<td>{{ isset($users[$r->jid]) ? "Lv".$users[$r->jid]->level." / ".$users[$r->jid]->xp."XP" : '-' }}</td>
<td>{{ $r->s }}</td></tr>
@endforeach</table>
</div>
@endsection
