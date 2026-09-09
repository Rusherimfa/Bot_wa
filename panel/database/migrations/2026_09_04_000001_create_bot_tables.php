<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Cerminkan skema bot Node (src/core/store.js). IF NOT EXISTS agar aman
    // bila bot sudah membuat duluan.
    public function up(): void
    {
        DB::statement('CREATE TABLE IF NOT EXISTS users (jid TEXT PRIMARY KEY, name TEXT, xp INT DEFAULT 0, level INT DEFAULT 1, balance INT DEFAULT 0)');
        DB::statement('CREATE TABLE IF NOT EXISTS scores (id SERIAL PRIMARY KEY, jid TEXT, game TEXT, points INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())');
        DB::statement('CREATE TABLE IF NOT EXISTS group_settings (jid TEXT PRIMARY KEY, welcome BOOLEAN DEFAULT false, antilink BOOLEAN DEFAULT false)');
        DB::statement('CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT, price INT, stock INT DEFAULT 0)');
        DB::statement('CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer TEXT, items JSONB, total INT, status TEXT DEFAULT \'pending\', created_at TIMESTAMPTZ DEFAULT now())');
        DB::statement('CREATE TABLE IF NOT EXISTS messages_log (id SERIAL PRIMARY KEY, jid TEXT, sender TEXT, body TEXT, created_at TIMESTAMPTZ DEFAULT now())');
        DB::statement('CREATE TABLE IF NOT EXISTS broadcasts (id SERIAL PRIMARY KEY, targets JSONB, body TEXT, run_at TIMESTAMPTZ, sent BOOLEAN DEFAULT false)');
        DB::statement('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
    }

    public function down(): void
    {
        // Sengaja tidak drop — tabel milik bersama dengan bot.
    }
};
