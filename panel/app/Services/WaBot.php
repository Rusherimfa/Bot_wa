<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class WaBot
{
    public static function base(): string
    {
        return rtrim(config('services.wabot.url'), '/');
    }

    public static function key(): string
    {
        return config('services.wabot.key');
    }

    public static function status(): ?array
    {
        try {
            $r = Http::withHeaders(['x-api-key' => self::key()])
                ->timeout(5)->get(self::base().'/wa/status');
            return $r->successful() ? $r->json() : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public static function qrPng(): ?string
    {
        try {
            $r = Http::withHeaders(['x-api-key' => self::key()])
                ->timeout(8)->get(self::base().'/wa/qr');
            return $r->successful() ? $r->body() : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public static function send(string $jid, string $text): bool
    {
        try {
            $r = Http::withHeaders(['x-api-key' => self::key()])
                ->timeout(15)->post(self::base().'/wa/send', ['jid' => $jid, 'text' => $text]);
            return $r->successful();
        } catch (\Throwable) {
            return false;
        }
    }
}
