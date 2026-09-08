#include "../firmware/src/cvid.h"
#include <stdio.h>
#include <stdlib.h>
int main(int argc,char **argv) {
    if(argc!=2) return 2;
    FILE *f=fopen(argv[1],"rb"); if(!f) return 3;
    fseek(f,0,SEEK_END); long size=ftell(f); rewind(f);
    uint8_t *bytes=malloc(size); if(!bytes || fread(bytes,1,size,f)!=(size_t)size) return 4; fclose(f);
    cv_header h;
    if(!cv_parse(&h,bytes,size) || cv_crc32(bytes+CV_HEADER,size-CV_HEADER)!=h.crc) return 5;
    uint8_t *frame=calloc(h.width*h.height,1); uint32_t expected=h.data_offset;
    for(unsigned i=0;i<h.frames;i++) {
        uint8_t *idx=bytes+h.index_offset+i*12; uint32_t off=cv_u32(idx),n=cv_u32(idx+4);
        if(off!=expected || n>h.size-off || (i%h.key_interval==0 && idx[8]==2) || !cv_decode(frame,h.width*h.height,bytes+off,n,idx[8])) return 6;
        expected=off+n;
    }
    if(expected!=h.size) return 7;
    printf("Native C decoder: %u frames verified, %ux%u at %u fps, %.3f MB.\n",h.frames,h.width,h.height,h.fps,h.size/1e6);
    free(bytes);free(frame);return 0;
}
