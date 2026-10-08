#!/usr/bin/env python3
"""Mixagem: locução (7 blocos posicionados no tempo) + trilha com ducking; mux com o vídeo mudo."""
import subprocess, sys
FF = subprocess.run([sys.executable, "-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"],
                    capture_output=True, text=True).stdout.strip()
import os
B = os.path.dirname(os.path.abspath(__file__))
BLD = os.environ.get("TRAILER_BUILD", f"{B}/build")
DUR = [12.02, 14.26, 12.98, 13.06, 10.61, 10.74, 8.67]
START = [0.40]
for d in DUR[:-1]:
    START.append(round(START[-1] + d + 0.45, 3))

ins = ["-i", f"{BLD}/music.wav"]
for i in range(7):
    ins += ["-i", f"{B}/locucao/c{i+1}.mp3"]
ins += ["-i", f"{BLD}/trailer_silent.mp4"]
VIDEO_IDX = 8

chains, mixes = [], []
for i in range(7):
    ms = int(START[i] * 1000)
    chains.append(f"[{i+1}:a]highpass=f=85,acompressor=threshold=-19dB:ratio=3:attack=6:release=180:makeup=2,"
                  f"volume=2.1,adelay={ms}|{ms}[v{i}]")
    mixes.append(f"[v{i}]")
chains.append("".join(mixes) + "amix=inputs=7:normalize=0,alimiter=limit=0.94,apad=whole_dur=89,asplit=2[vozA][vozB]")
chains.append("[0:a]volume=0.30,highpass=f=45[mus]")
chains.append("[mus][vozB]sidechaincompress=threshold=0.035:ratio=7:attack=25:release=420:makeup=1[musd]")
chains.append("[vozA][musd]amix=inputs=2:duration=longest:normalize=0,"
              "loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=89[out]")
filt = ";".join(chains)

cmd = [FF, "-y", "-hide_banner", "-loglevel", "error", "-stats"] + ins + [
    "-filter_complex", filt, "-map", f"{VIDEO_IDX}:v:0", "-map", "[out]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", "-t", "89", f"{BLD}/trailer.mp4"]
subprocess.run(cmd, check=True)
print("OK -> trailer.mp4")
