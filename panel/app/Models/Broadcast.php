<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Broadcast extends Model
{
    protected $table = 'broadcasts';
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = ['targets' => 'array', 'sent' => 'bool'];
}
