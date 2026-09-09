<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'orders';
    public $timestamps = false;
    protected $guarded = [];
    const CREATED_AT = 'created_at';
    protected $casts = ['items' => 'array'];
}
