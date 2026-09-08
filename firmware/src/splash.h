#ifndef CASIO_SPLASH_H
#define CASIO_SPLASH_H
#include <gint/display.h>
#include <gint/clock.h>
#include <stdint.h>
/* Keep the intro independent of the model/player and of OS status margins. */
static void casio_splash(const char *title) {
    uint16_t glyphs[220*20]; int w,h;
    dclear(C_WHITE); dsize(title,NULL,&w,&h);
    if(w>220) w=220;
    if(h>20) h=20;
    dtext(0,0,C_RGB(4,15,30),title);
    for(int y=0;y<h;y++) for(int x=0;x<w;x++) glyphs[y*w+x]=gint_vram[y*DWIDTH+x];
    dclear(C_WHITE);
    int scale=w*3<DWIDTH-24?3:2,x0=(DWIDTH-w*scale)/2,y0=(DHEIGHT-h*scale)/2;
    for(int y=0;y<h*scale;y++) for(int x=0;x<w*scale;x++) gint_vram[(y0+y)*DWIDTH+x0+x]=glyphs[(y/scale)*w+x/scale];
    dtext_opt(DWIDTH-7,DHEIGHT-7,C_BLACK,C_NONE,DTEXT_RIGHT,DTEXT_BOTTOM,"samilososami.com");
    dupdate(); sleep_us(850000);
}
#endif
