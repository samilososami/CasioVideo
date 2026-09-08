#include <gint/display.h>
#include <gint/keyboard.h>
#include <gint/drivers/keydev.h>
#include <gint/clock.h>
#include <gint/rtc.h>
#include <gint/gint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include "storage.h"
#include "splash.h"

static bool light, playing, paused, settings, dirty=true;
static int selected,scrollrow,setting_row,speed=1,decoded=-1;
static uint32_t base_ticks,base_ms,hud_until;
static const unsigned speeds[]={1,2,3,4};
static const char *speed_names[]={"0.5x","1x","1.5x","2x"};
static uint16_t palette[256];
static char error_text[100];
#define BG (light?C_WHITE:C_RGB(3,3,4))
#define FG (light?C_BLACK:C_WHITE)
#define MUTED (light?C_RGB(11,11,13):C_RGB(25,25,27))
#define BLUE C_RGB(6,15,30)

static void text(int x,int y,int c,const char *s) { dtext(x,y,c,s); }
static void bold(int x,int y,int c,const char *s) { text(x,y,c,s); text(x+1,y,c,s); }
static void center(int y,int c,const char *s) { dtext_opt(DWIDTH/2,y,c,C_NONE,DTEXT_CENTER,DTEXT_TOP,s); }
static void triangle(int x,int y,int color,int size) { for(int i=0;i<size;i++) dline(x+i,y+i/2,x+i,y+size-1-i/2,color); }
static void gear(int x,int y,int c) {
    int center=gint_vram[y*DWIDTH+x];
    dcircle(x,y,5,c,c);
    drect(x-1,y-8,x+1,y+8,c); drect(x-8,y-1,x+8,y+1,c);
    dline(x-5,y-6,x+6,y+5,c); dline(x-6,y-5,x+5,y+6,c);
    dline(x-5,y+6,x+6,y-5,c); dline(x-6,y+5,x+5,y-6,c);
    dcircle(x,y,2,center,center);
}
static void film(int x,int y,int c) {
    drect_border(x,y,x+36,y+28,C_NONE,2,c);
    for(int i=3;i<34;i+=7) { drect(x+i,y+3,x+i+3,y+6,c); drect(x+i,y+22,x+i+3,y+25,c); }
    triangle(x+14,y+9,c,11);
}
static void fmt_time(char *out,size_t n,uint32_t ms) { unsigned s=ms/1000; snprintf(out,n,"%u:%02u",s/60,s%60); }
static uint32_t position(void) {
    if(!playing || paused) return base_ms;
    return base_ms+(uint32_t)(rtc_ticks()-base_ticks)*1000u/128u*speeds[speed]/2u;
}
static void rebase(uint32_t ms) { base_ms=ms; base_ticks=rtc_ticks(); }
static void scaled_thumb(uint8_t *raw,int x,int y,int w,int h) {
    for(int dy=0;dy<h;dy++) {
        if(y+dy<22 || y+dy>=DHEIGHT-22) continue;
        for(int dx=0;dx<w;dx++) gint_vram[(y+dy)*DWIDTH+x+dx]=cv_u16(raw+2*((dy*CV_THUMB_H/h)*CV_THUMB_W+dx*CV_THUMB_W/w));
    }
}
static void library(void) {
    dclear(BG); bold(10,6,FG,"CasioVideo");
    char count[30]; snprintf(count,sizeof count,"%d videos",cv_count);
    dtext_opt(DWIDTH-10,6,MUTED,C_NONE,DTEXT_RIGHT,DTEXT_TOP,count);
    if(cv_count==0) {
        film(DWIDTH/2-18,49,MUTED);
        center(94,MUTED,"No hay archivos de videos cargados");
        center(107,MUTED,"en la calculadora. Accede a");
        center(127,MUTED,"samilososami.com/tools/casiovideo");
        center(145,MUTED,"para cargar alguno");
        if(cv_invalid) center(170,MUTED,"Hay archivos incompatibles o incompletos.");
    } else {
        uint8_t *thumb=malloc(CV_THUMB_BYTES);
        struct dwindow old=dwindow_set((struct dwindow){0,22,DWIDTH,DHEIGHT-22});
        for(int i=scrollrow*3;i<cv_count && i<scrollrow*3+6;i++) {
            int x=4+(i%3)*132, y=24+(i/3-scrollrow)*88;
            int active=i==selected, c=active?(light?C_WHITE:C_BLACK):FG;
            if(active) drect(x,y,x+125,y+84,light?BLUE:C_WHITE);
            drect(x+5,y+5,x+120,y+69,C_BLACK);
            if(thumb && cv_thumbnail(i,thumb)) scaled_thumb(thumb,x+5,y+5,116,65);
            else film(x+43,y+23,C_RGB(20,20,22));
            char time[24]; fmt_time(time,sizeof time,cv_videos[i].h.duration_ms);
            int tw; dsize(time,NULL,&tw,NULL);
            drect(x+118-tw-4,y+55,x+119,y+67,C_BLACK);
            text(x+118-tw-2,y+57,C_WHITE,time);
            char label[121]; snprintf(label,sizeof label,"%s",cv_videos[i].h.title[0]?cv_videos[i].h.title:cv_videos[i].name);
            const char *end=drsize(label,NULL,114,NULL);
            if(*end) { int n=end-label; if(n>3) { label[n-3]='.'; label[n-2]='.'; label[n-1]='.'; } label[n]=0; }
            text(x+6,y+74,c,label);
        }
        dwindow_set(old); free(thumb);
    }
    drect(0,DHEIGHT-22,DWIDTH-1,DHEIGHT-1,BG);
    dline(0,DHEIGHT-22,DWIDTH-1,DHEIGHT-22,light?C_RGB(27,27,28):C_RGB(8,8,9));
    triangle(DWIDTH-140,DHEIGHT-15,FG,10); bold(DWIDTH-120,DHEIGHT-15,FG,"EXE");
    gear(DWIDTH-51,DHEIGHT-10,FG); bold(DWIDTH-34,DHEIGHT-15,FG,"F6");
}
static void draw_frame(void) {
    dclear(C_BLACK);
    if(decoded<0 || !cv_frame()) return;
    cv_header *h=&cv_videos[selected].h; const uint8_t *p=cv_frame();
    int w=DWIDTH,vh=(int)h->height*DWIDTH/h->width;
    if(vh>DHEIGHT) { vh=DHEIGHT; w=(int)h->width*DHEIGHT/h->height; }
    int x0=(DWIDTH-w)/2,y0=(DHEIGHT-vh)/2;
    for(int y=0;y<vh;y++) {
        const uint8_t *line=p+(y*h->height/vh)*h->width;
        uint16_t *out=gint_vram+(y0+y)*DWIDTH+x0;
        for(int x=0;x<w;x++) out[x]=palette[line[x*h->width/w]];
    }
}
static void player_hud(void) {
    cv_header *h=&cv_videos[selected].h; uint32_t pos=position(); if(pos>h->duration_ms) pos=h->duration_ms;
    drect(0,DHEIGHT-49,DWIDTH-1,DHEIGHT-1,C_RGB(2,2,3));
    char now[24],total[24],times[52]; fmt_time(now,sizeof now,pos); fmt_time(total,sizeof total,h->duration_ms);
    snprintf(times,sizeof times,"%s/%s",now,total);
    drect(10,DHEIGHT-39,277,DHEIGHT-37,C_RGB(14,14,15));
    int px=10+(int)(267u*pos/h->duration_ms);
    drect(10,DHEIGHT-39,px,DHEIGHT-37,BLUE); dcircle(px,DHEIGHT-38,3,BLUE,BLUE);
    text(287,DHEIGHT-43,C_WHITE,times);
    if(paused) triangle(11,DHEIGHT-23,C_WHITE,10);
    else { drect(11,DHEIGHT-23,13,DHEIGHT-14,C_WHITE); drect(17,DHEIGHT-23,19,DHEIGHT-14,C_WHITE); }
    bold(27,DHEIGHT-23,C_WHITE,"EXE"); text(66,DHEIGHT-23,C_WHITE,"< -5s  +5s >");
    text(181,DHEIGHT-23,C_WHITE,"EXIT Volver"); gear(318,DHEIGHT-19,C_WHITE); text(331,DHEIGHT-23,C_WHITE,"F6");
}
static void drawer(void) {
    int x=DWIDTH-182;
    drect(x,0,DWIDTH-1,DHEIGHT-1,light?C_RGB(29,29,30):C_RGB(6,6,7));
    dline(x,0,x,DHEIGHT-1,light?C_RGB(24,24,26):C_RGB(12,12,14));
    gear(x+17,20,FG); bold(x+35,15,FG,"Ajustes");
    drect(x+7,51+setting_row*51,DWIDTH-7,93+setting_row*51,light?BLUE:C_WHITE);
    int a=setting_row==0?(light?C_WHITE:C_BLACK):FG;
    int b=setting_row==1?(light?C_WHITE:C_BLACK):FG;
    text(x+15,59,a,"Apariencia"); text(x+15,76,a,light?"< Claro >":"< Oscuro >");
    text(x+15,110,b,"Velocidad"); char s[30]; snprintf(s,sizeof s,"< %s >",speed_names[speed]); text(x+15,127,b,s);
    text(x+12,173,MUTED,"Flechas / EXE Cambiar"); text(x+12,191,MUTED,"EXIT / F6 Cerrar");
}
static void render(void) {
    if(playing) { draw_frame(); if(paused || rtc_ticks()<hud_until) player_hud(); }
    else library();
    if(settings) drawer();
    if(error_text[0]) {
        drect(15,80,DWIDTH-16,150,C_RGB(6,6,7));
        center(94,C_WHITE,error_text); center(126,C_WHITE,"EXE / EXIT Cerrar");
    }
    dupdate(); dirty=false;
}
static void stop_video(void) { cv_close(); playing=false; paused=false; decoded=-1; dirty=true; settings=false; }
static void start_video(void) {
    if(!cv_open(selected)) { snprintf(error_text,sizeof error_text,"No se puede abrir el video (RAM/archivo)."); dirty=true; return; }
    playing=true; paused=false; decoded=-1; rebase(0); hud_until=rtc_ticks()+384; dirty=true;
}
static void seek_to(int offset) {
    int64_t p=(int64_t)position()+offset;
    uint32_t max=cv_videos[selected].h.duration_ms-1;
    if(p<0) p=0;
    if(p>max) p=max;
    rebase((uint32_t)p); decoded=-1; dirty=true;
}
static bool input(int key) {
    if(error_text[0]) { if(key==KEY_EXE || key==KEY_EXIT) { error_text[0]=0; dirty=true; } return false; }
    if(key==KEY_MENU) { stop_video(); return true; }
    if(playing) hud_until=rtc_ticks()+384;
    if(settings) {
        if(key==KEY_EXIT || key==KEY_F6) settings=false;
        if(key==KEY_UP || key==KEY_DOWN) setting_row=1-setting_row;
        if(key==KEY_EXE || key==KEY_LEFT || key==KEY_RIGHT) {
            if(setting_row==0) light=!light;
            else { uint32_t p=position(); speed=(speed+(key==KEY_LEFT?3:1))%4; rebase(p); }
        }
    } else if(key==KEY_F6) { settings=true; setting_row=0; }
    else if(playing) {
        if(key==KEY_EXIT) stop_video();
        else if(key==KEY_EXE) { uint32_t p=position(); paused=!paused; if(!paused && p>=cv_videos[selected].h.duration_ms) { p=0; decoded=-1; } rebase(p); }
        else if(key==KEY_LEFT) seek_to(-5000);
        else if(key==KEY_RIGHT) seek_to(5000);
    } else {
        if(key==KEY_EXIT) return true;
        if(key==KEY_LEFT && selected>0) selected--;
        if(key==KEY_RIGHT && selected+1<cv_count) selected++;
        if(key==KEY_UP && selected>=3) selected-=3;
        if(key==KEY_DOWN && selected+3<cv_count) selected+=3;
        if(selected/3<scrollrow) scrollrow=selected/3;
        if(selected/3>=scrollrow+2) scrollrow=selected/3-1;
        if(key==KEY_EXE && cv_count) start_video();
    }
    dirty=true; return false;
}
int main(void) {
    /* Casio resumes a returned add-in unless gint restarts its entry point. */
    gint_setrestart(1);
    casio_splash("CasioVideo");
    for(int i=0;i<256;i++) palette[i]=cv_rgb565(i);
    cv_scan();
    keydev_t *kbd=keydev_std(); keydev_transform_t previous_transform=keydev_transform(kbd),t=previous_transform;
    t.enabled|=KEYDEV_TR_REPEATS|KEYDEV_TR_DELETE_RELEASES;
    keydev_set_transform(kbd,t); keydev_set_standard_repeats(kbd,500000,120000);
    while(true) {
        key_event_t ev=keydev_read(kbd,false,NULL);
        if((ev.type==KEYEV_DOWN || ev.type==KEYEV_HOLD) && input(ev.key)) break;
        if(playing && !error_text[0]) {
            cv_header *h=&cv_videos[selected].h;
            uint32_t pos=position(); unsigned target=pos*h->fps/1000u;
            if(target>=h->frames) target=h->frames-1;
            if(decoded<0 || target<(unsigned)decoded || target>(unsigned)decoded+h->key_interval) decoded=(int)(target/h->key_interval*h->key_interval)-1;
            if(decoded<(int)target) {
                if(!cv_load_frame((unsigned)(decoded+1))) { stop_video(); snprintf(error_text,sizeof error_text,"Video incompleto o incompatible."); }
                else { decoded++; dirty=true; }
            }
            if(pos>=h->duration_ms && decoded==(int)h->frames-1) { paused=true; rebase(h->duration_ms); dirty=true; }
            static bool was_hud; bool show=paused || rtc_ticks()<hud_until;
            if(show!=was_hud) dirty=true;
            was_hud=show;
        }
        if(dirty) render();
        sleep_us(8000);
    }
    cv_close(); keydev_set_transform(kbd,previous_transform); return 1;
}
