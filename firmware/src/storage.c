#include "storage.h"
#include <gint/bfile.h>
#include <gint/gint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
cv_video cv_videos[CV_LIBRARY_MAX];
int cv_count,cv_invalid;
static int fd=-1, opened=-1, previous=-1;
static uint8_t *frame,*packed;
static uint32_t packed_cap;
static void path_for(uint16_t *out,const char *name) {
    const char *prefix="\\\\fls0\\";
    while(*prefix) *out++=(unsigned char)*prefix++;
    while(*name) *out++=(unsigned char)*name++;
    *out=0;
}
static int os_scan(void) {
    int search=-1, rc; uint16_t name[256]; struct BFile_FileInfo info;
    cv_count=cv_invalid=0;
    rc=BFile_FindFirst(u"\\\\fls0\\*.cvid",&search,name,&info);
    while(rc==0) {
        if(cv_count<CV_LIBRARY_MAX) {
            char ascii[32]; size_t i=0;
            while(i<31 && name[i] && name[i]<128) { ascii[i]=(char)name[i]; i++; } ascii[i]=0;
            if(!name[i] && i && !strchr(ascii,'\\') && !strchr(ascii,'/')) {
                uint16_t path[64]; uint8_t raw[CV_HEADER]; path_for(path,ascii);
                int f=BFile_Open(path,BFile_ReadOnly);
                if(f>=0) {
                    int size=BFile_Size(f);
                    if(size>=(int)CV_HEADER && BFile_Read(f,raw,CV_HEADER,0)==(int)CV_HEADER && cv_parse(&cv_videos[cv_count].h,raw,size)) {
                        strcpy(cv_videos[cv_count].name,ascii); cv_count++;
                    } else cv_invalid++;
                    BFile_Close(f);
                } else cv_invalid++;
            }
        }
        rc=BFile_FindNext(search,name,&info);
    }
    if(search>=0) BFile_FindClose(search);
    return cv_count;
}
int cv_scan(void) { return gint_world_switch(GINT_CALL(os_scan)); }
static int os_close(void) { if(fd>=0) BFile_Close(fd); fd=-1; return 0; }
void cv_close(void) {
    if(fd>=0) gint_world_switch(GINT_CALL(os_close));
    free(frame); free(packed); frame=packed=NULL; previous=opened=-1;
}
static int os_open(void) {
    uint16_t path[64]; path_for(path,cv_videos[opened].name);
    fd=BFile_Open(path,BFile_ReadOnly);
    return fd>=0;
}
int cv_open(int video) {
    cv_close(); if(video<0 || video>=cv_count) return 0;
    opened=video; uint32_t pixels=cv_videos[video].h.width*cv_videos[video].h.height;
    packed_cap=pixels+pixels/128+8;
    frame=malloc(pixels); packed=malloc(packed_cap);
    if(!frame || !packed || !gint_world_switch(GINT_CALL(os_open))) { cv_close(); return 0; }
    memset(frame,0,pixels); return 1;
}
static int os_frame(unsigned index) {
    cv_header *h=&cv_videos[opened].h;
    uint8_t record[12];
    if(BFile_Read(fd,record,12,(int)(h->index_offset+12*index))!=12) return 0;
    uint32_t offset=cv_u32(record),size=cv_u32(record+4); unsigned kind=record[8];
    if(kind>2 || offset<h->data_offset || offset>h->size || size>h->size-offset || !size || size>packed_cap) return 0;
    if(index%h->key_interval==0 && kind==2) return 0;
    if(kind==2 && previous!=(int)index-1) return 0;
    if(BFile_Read(fd,packed,(int)size,(int)offset)!=(int)size) return 0;
    if(!cv_decode(frame,h->width*h->height,packed,size,kind)) return 0;
    previous=(int)index; return 1;
}
int cv_load_frame(unsigned index) {
    if(opened<0 || index>=cv_videos[opened].h.frames) return 0;
    return gint_world_switch(GINT_CALL(os_frame,index));
}
const uint8_t *cv_frame(void) { return frame; }
static int os_thumbnail(int video,uint8_t *dest) {
    uint16_t path[64]; path_for(path,cv_videos[video].name);
    int f=BFile_Open(path,BFile_ReadOnly); if(f<0) return 0;
    int ok=cv_videos[video].h.thumb_bytes==CV_THUMB_BYTES && BFile_Read(f,dest,CV_THUMB_BYTES,CV_HEADER)==CV_THUMB_BYTES;
    BFile_Close(f); return ok;
}
int cv_thumbnail(int video,uint8_t *dest) { return gint_world_switch(GINT_CALL(os_thumbnail,video,dest)); }
