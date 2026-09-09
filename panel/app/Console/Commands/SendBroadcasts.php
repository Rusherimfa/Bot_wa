<?php

namespace App\Console\Commands;

use App\Models\Broadcast;
use App\Services\WaBot;
use Illuminate\Console\Command;

class SendBroadcasts extends Command
{
    protected $signature = 'wa:send-broadcasts';
    protected $description = 'Kirim broadcast yang jatuh tempo (max 5 target/menit, anti-ban)';

    public function handle(): int
    {
        $due = Broadcast::where('sent', false)->where('run_at', '<=', now())->orderBy('id')->get();
        foreach ($due as $b) {
            $targets = array_slice($b->targets ?? [], 0, 5); // batas anti-ban per menit
            foreach ($targets as $i => $jid) {
                if ($i > 0) sleep(12); // jeda 12 detik antar pesan
                if (! WaBot::send($jid, $b->body)) {
                    $this->error("gagal kirim ke $jid (bot offline?)");
                    return self::FAILURE; // coba lagi menit berikutnya
                }
                $this->info("terkirim ke $jid");
            }
            $b->update(['sent' => true]);
        }
        $this->info('selesai.');
        return self::SUCCESS;
    }
}
