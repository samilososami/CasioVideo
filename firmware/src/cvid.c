#include "cvid.h"
#include <string.h>
uint16_t cv_u16(const uint8_t *p) { return p[0] | ((uint16_t)p[1] << 8); }
uint32_t cv_u32(const uint8_t *p) { return cv_u16(p) | ((uint32_t)cv_u16(p+2) << 16); }
uint32_t cv_crc32(const uint8_t *p, size_t n) {
    uint32_t c=~0u;
    for(size_t i=0;i<n;i++) {
        c ^= p[i];
        for(int j=0;j<8;j++) c=(c>>1)^((0u-(c&1u))&0xedb88320u);
    }
    return ~c;
}
int cv_parse(cv_header *h,const uint8_t *p,uint32_t size) {
    if(size<CV_HEADER || size>CV_MAX_FILE || memcmp(p,"CASVID01",8) || cv_u16(p+8)!=1 || cv_u16(p+10)!=CV_HEADER) return 0;
    if(cv_crc32(p,252)!=cv_u32(p+252) || memcmp(p+184,"CasioVideo",10)) return 0;
    h->width=cv_u16(p+12); h->height=cv_u16(p+14); h->fps=cv_u16(p+16); h->key_interval=cv_u16(p+18);
    h->frames=cv_u32(p+20); h->duration_ms=cv_u32(p+24); h->thumb_offset=cv_u32(p+28); h->thumb_bytes=cv_u32(p+32);
    h->index_offset=cv_u32(p+36); h->data_offset=cv_u32(p+40); h->size=cv_u32(p+44); h->crc=cv_u32(p+48);
    memcpy(h->title,p+64,120); h->title[120]=0;
    if(!h->width || h->width>396 || !h->height || h->height>224 || !h->fps || h->fps>24 || !h->key_interval || h->key_interval>24) return 0;
    if(!h->frames || h->frames>200000 || !h->duration_ms || h->duration_ms>14400000 || h->size!=size) return 0;
    if(h->duration_ms>(h->frames*1000u/h->fps)+1000u || h->duration_ms+1000u<h->frames*1000u/h->fps) return 0;
    if(h->thumb_offset!=CV_HEADER || (h->thumb_bytes!=0 && h->thumb_bytes!=CV_THUMB_BYTES)) return 0;
    if(h->thumb_bytes && (cv_u16(p+52)!=CV_THUMB_W || cv_u16(p+54)!=CV_THUMB_H)) return 0;
    if(h->index_offset!=CV_HEADER+h->thumb_bytes || h->data_offset!=h->index_offset+h->frames*12u || h->data_offset>=size) return 0;
    return 1;
}
int cv_decode(uint8_t *frame,size_t pixels,const uint8_t *src,size_t n,unsigned kind) {
    if(kind==0) { if(n!=pixels) return 0; memcpy(frame,src,pixels); return 1; }
    if(kind!=1 && kind!=2) return 0;
    size_t i=0,o=0;
    while(i<n) {
        unsigned code=src[i++], count=(code&127u)+1;
        if(count>pixels-o) return 0;
        if(code&128u) {
            if(i>=n) return 0;
            uint8_t value=src[i++];
            for(unsigned j=0;j<count;j++,o++) { if(kind==2) frame[o]^=value; else frame[o]=value; }
        } else {
            if(count>n-i) return 0;
            for(unsigned j=0;j<count;j++,o++,i++) { if(kind==2) frame[o]^=src[i]; else frame[o]=src[i]; }
        }
    }
    return o==pixels;
}
uint16_t cv_rgb565(uint8_t p) {
    unsigned r=p>>5,g=(p>>2)&7,b=p&3;
    return (r*31/7)<<11 | (g*63/7)<<5 | b*31/3;
}
