<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GroupSetting extends Model
{
    protected $table = 'group_settings';
    protected $primaryKey = 'jid';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
    protected $guarded = [];
}
