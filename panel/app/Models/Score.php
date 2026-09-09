<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Score extends Model
{
    protected $table = 'scores';
    public $timestamps = false;
    protected $guarded = [];
    const CREATED_AT = 'created_at';
}
