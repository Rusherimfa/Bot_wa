<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PanelAdmin extends Model
{
    protected $table = 'panel_admins';
    protected $guarded = [];
    protected $hidden = ['password'];
}
