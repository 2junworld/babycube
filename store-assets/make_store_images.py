# 베이비큐브 스토어 소개 이미지 5장 생성 (1080x1920 SVG -> PNG)
import os, html, cairosvg

OUT = "/sessions/zealous-friendly-cori/mnt/육아/babycube/store-assets"
os.makedirs(OUT, exist_ok=True)

# 앱 팔레트
BG="#FAF7F1"; SURF="#FFFFFF"; BORDER="#ECE5D6"; INK="#2A2722"; SOFT="#534D43"; MUTED="#9A9285"
SAGE="#6B8F71"; SAGED="#4F6E55"; SAGEL="#E4ECE2"; APR="#E07A3F"; APRL="#FBE6D6"; BUT="#E8B94A"; BUTL="#FBF0D6"
C_CARB="#9A9285"; C_PROT="#B9695C"; C_VEG="#6B8F71"; C_FRUIT="#E8B94A"
FONT="Noto Sans CJK KR"

def esc(s): return html.escape(s, quote=True)

def rect(x,y,w,h,r=0,fill=SURF,stroke=None,sw=2,opacity=1):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" opacity="{opacity}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'

def txt(x,y,s,size,fill=INK,weight="normal",anchor="start",spacing=None):
    sp=f' letter-spacing="{spacing}"' if spacing else ""
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{sp}>{esc(s)}</text>'

def dot(x,y,r,fill): return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'

def pill(x,y,w,h,label,size,bg,fg,weight="bold"):
    return rect(x,y,w,h,h/2,bg)+txt(x+w/2,y+h/2+size*0.36,label,size,fg,weight,"middle")

def cubegrid(x,y,n,filled,cell=22,gap=8,fill=SAGE):
    out=""
    for i in range(n):
        f = fill if i<filled else "none"
        st = "" if i<filled else f' stroke="{BORDER}" stroke-width="3"'
        out+=f'<rect x="{x+i*(cell+gap)}" y="{y}" width="{cell}" height="{cell}" rx="5" fill="{f if f!="none" else "transparent"}"{st}/>'
    return out

def catbar(x,y,w,h,parts):
    # parts: [(color, ratio)]
    out=f'<clipPath id="cb{x}{y}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}"/></clipPath><g clip-path="url(#cb{x}{y})">'
    cx=x
    for color,ratio in parts:
        pw=w*ratio
        out+=f'<rect x="{cx}" y="{y}" width="{pw}" height="{h}" fill="{color}"/>'
        cx+=pw
    return out+'</g>'

def cubemark(x,y,size,color=SAGE):
    g=int(size*0.12); c=(size-g)/2
    out=f'<rect x="{x}" y="{y}" width="{c}" height="{c}" rx="6" fill="{color}"/>'
    out+=f'<rect x="{x+c+g}" y="{y}" width="{c}" height="{c}" rx="6" fill="{color}"/>'
    out+=f'<rect x="{x+c+g}" y="{y+c+g}" width="{c}" height="{c}" rx="6" fill="{color}"/>'
    out+=f'<rect x="{x}" y="{y+c+g}" width="{c}" height="{c}" rx="6" fill="none" stroke="{SAGEL}" stroke-width="5"/>'
    return out

def header_zone(num,total,title,sub):
    out=pill(400,90,280,64,"베이비큐브",30,SAGE,"#FFFFFF")
    out+=txt(540,256,title,72,INK,"bold","middle")
    out+=txt(540,330,sub,38,MUTED,"normal","middle")
    out+=txt(1030,146,f"{num} / {total}",28,MUTED,"normal","end")
    return out

def phone_frame(inner, ph_title="베이비큐브", ph_right=""):
    S=1.15; w=720*S; h=1330*S; x=(1080-w)/2; y=385
    out=f'<rect x="{x-14}" y="{y-14}" width="{w+28}" height="{h+28}" rx="70" fill="{INK}" opacity="0.06"/>'
    out+=rect(x,y,w,h,58,SURF,BORDER,3)
    out+=f'<g transform="translate({x},{y}) scale({S})">'
    out+=cubemark(44,46,40)
    out+=txt(104,80,ph_title,36,INK,"bold")
    if ph_right: out+=txt(676,78,ph_right,26,MUTED,"normal","end")
    out+=f'<g transform="translate(0,130)">'+inner+"</g></g>"
    return out

def card(x,y,w,h,r=24,fill=SURF,stroke=BORDER):
    return rect(x,y,w,h,r,fill,stroke,2.5)

def svg_doc(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="{BG}"/>{body}</svg>'

def ing_row(x,y,color,name,size=27):
    return dot(x,y-9,9,color)+txt(x+24,y,name,size,SOFT)

# ---------- 이미지 1: 오늘 탭 ----------
inner=""
# 냉장 임박 배너
inner+=card(44,10,632,104,22,APRL,APRL)
inner+=txt(80,54,"냉장 보관 이유식 소진 임박",30,"#9A4A1E","bold")
inner+=txt(80,94,"소고기 · 브로콜리 — 오늘~내일 사용 권장",25,"#A85B30")
# 끼니 카드 1 (완료)
inner+=card(44,140,632,330)
inner+=txt(80,204,"아침",34,INK,"bold")+txt(160,204,"07:00",27,MUTED)
inner+=pill(540,172,100,46,"완료",24,BUTL,"#9A7416")
inner+=ing_row(84,262,C_CARB,"죽")+ing_row(214,262,C_PROT,"소고기")+ing_row(394,262,C_VEG,"브로콜리")
inner+=ing_row(84,312,C_VEG,"애호박")
inner+=catbar(80,344,560,14,[(C_CARB,0.55),(C_PROT,0.15),(C_VEG,0.3)])
inner+=f'<line x1="80" y1="392" x2="640" y2="392" stroke="{BORDER}" stroke-width="2" stroke-dasharray="8 8"/>'
inner+=txt(80,440,"150g 중 140g (93%)",30,SAGED,"bold")
inner+=pill(510,406,130,50,"수정",25,SAGEL,SAGED)
# 끼니 카드 2 (예정)
inner+=card(44,500,632,300)
inner+=txt(80,564,"점심",34,INK,"bold")+txt(160,564,"12:00",27,MUTED)
inner+=pill(540,532,100,46,"예정",24,SAGEL,SAGED)
inner+=ing_row(84,622,C_CARB,"죽")+ing_row(214,622,C_PROT,"닭고기")+ing_row(394,622,C_VEG,"청경채")
inner+=catbar(80,662,560,14,[(C_CARB,0.6),(C_PROT,0.2),(C_VEG,0.2)])
inner+=f'<line x1="80" y1="710" x2="640" y2="710" stroke="{BORDER}" stroke-width="2" stroke-dasharray="8 8"/>'
inner+=txt(80,758,"총 제공 예정 135g",29,MUTED)
inner+=pill(480,724,160,50,"기록하기",25,SAGEL,SAGED)
# 곧 떨어지는 재료
inner+=card(44,830,632,290)
inner+=txt(80,894,"곧 떨어지는 재료",31,INK,"bold")
inner+=txt(80,952,"소고기",28,SOFT)+cubegrid(220,930,10,2)+txt(640,952,"~2일",26,APR,"bold","end")
inner+=txt(80,1014,"브로콜리",28,SOFT)+cubegrid(220,992,10,4)+txt(640,1014,"~4일",26,APR,"bold","end")
inner+=pill(80,1050,560,54,"장보기 · 제조 목록 보기",26,SAGEL,SAGED)
img1=svg_doc(header_zone(1,5,"이유식 준비, 온 가족이 함께","재고 · 식단 · 급여 기록을 하나로 관리해요")+phone_frame(inner,"베이비큐브","생후 9개월 · 오늘"))

# ---------- 이미지 2: 식단 계획 + 궁합 ----------
inner=""
inner+=card(44,10,632,270,26,SAGEL,SAGEL)
inner+=txt(80,66,"끼니 종류",28,SAGED)+txt(640,66,"아침 ›",30,SAGED,"bold","end")
inner+=txt(80,120,"끼니 시간",28,SAGED)+txt(640,120,"07:00",30,SAGED,"bold","end")
inner+=f'<line x1="80" y1="150" x2="640" y2="150" stroke="{SAGE}" stroke-width="2" stroke-dasharray="8 8"/>'
inner+=txt(80,206,"끼니 총량",30,SAGED,"bold")+txt(640,210,"150g",44,SAGED,"bold","end")
inner+=catbar(80,234,560,16,[(C_CARB,0.5),(C_PROT,0.15),(C_VEG,0.25),(C_FRUIT,0.1)])
# 궁합 추천 카드
inner+=card(44,310,632,470)
inner+=txt(80,372,"재료 궁합 — 지금 재고에서 추천",29,INK,"bold")
inner+=dot(92,420,9,C_VEG)+txt(116,430,"브로콜리",29,INK,"bold")
inner+=pill(262,400,110,40,"근거 A",22,SAGEL,SAGED)
inner+=pill(530,398,110,48,"추가",25,SURF,SAGED)+f'<rect x="530" y="398" width="110" height="48" rx="24" fill="none" stroke="{SAGE}" stroke-width="2.5"/>'
inner+=txt(116,472,"소고기와 함께 — 비타민 C가 철분 흡수를 높여줘요",24,MUTED)
inner+=dot(92,530,9,C_FRUIT)+txt(116,540,"귤",29,INK,"bold")
inner+=pill(180,510,110,40,"근거 A",22,SAGEL,SAGED)
inner+=pill(530,508,110,48,"추가",25,SURF,SAGED)+f'<rect x="530" y="508" width="110" height="48" rx="24" fill="none" stroke="{SAGE}" stroke-width="2.5"/>'
inner+=txt(116,582,"시금치와 함께 — 식물성 철분 흡수를 도와줘요",24,MUTED)
inner+=card(80,614,560,120,18,APRL,APRL)
inner+=txt(108,662,"⚠ 시금치 + 두부",27,"#9A4A1E","bold")
inner+=txt(108,704,"옥살산이 칼슘 흡수를 방해할 수 있어요",24,"#A85B30")
inner+=txt(80,766,"* 확립된 영양소 상호작용만 안내하는 참고 정보예요",21,MUTED)
# 재료 카드
inner+=card(44,810,632,310)
inner+=txt(80,872,"재료 (4)",28,MUTED,"bold")
inner+=ing_row(92,930,C_CARB,"죽 · 4큐브 (80g)",28)
inner+=ing_row(92,988,C_PROT,"소고기 · 1큐브 (15g)",28)
inner+=ing_row(92,1046,C_VEG,"시금치 · 1큐브 (15g)",28)
inner+=ing_row(92,1104,C_VEG,"브로콜리 · 1큐브 (15g)",28)
img2=svg_doc(header_zone(2,5,"끼니 계획과 재료 궁합 추천","영양학적 근거가 확립된 조합만 골라 알려드려요")+phone_frame(inner,"끼니 추가","2026-07-05 (일)"))

# ---------- 이미지 3: 재고 ----------
inner=""
# 필터 칩
chips=[("전체",True),("소진임박",False),("냉동",False),("냉장",False),("채소",False)]
cx=44
for label,on in chips:
    w=len(label)*26+44
    inner+=pill(cx,14,w,52,label,25,SAGE if on else SAGEL,"#FFFFFF" if on else SAGED)
    cx+=w+14
inner+=pill(44,92,632,68,"+  제조 기록 추가",29,SAGE,"#FFFFFF")
rows=[("애호박",C_VEG,9,"9큐브",False),("단호박",C_VEG,6,"6큐브",False),("소고기",C_PROT,2,"2큐브 · 냉장 40g",True),
      ("닭고기",C_PROT,5,"5큐브",False),("브로콜리",C_VEG,4,"4큐브 · 냉장 20g",True),("당근",C_VEG,7,"7큐브",False),("배",C_FRUIT,3,"3큐브",False)]
y=196
for name,color,cubes,amount,urgent in rows:
    stroke = APR if urgent else BORDER
    inner+=card(44,y,632,104,20,SURF,stroke)
    inner+=dot(88,y+52,10,color)+txt(116,y+62,name,30,INK,"bold")
    if urgent:
        inner+=pill(258,y+30,150,44,"냉장 ~1일",22,APRL,APR)
    else:
        inner+=cubegrid(300,y+40,6,min(cubes,6),20,7)
    inner+=txt(640,y+62,amount,24,MUTED,"normal","end")
    y+=124
img3=svg_doc(header_zone(3,5,"냉동 큐브 재고를 한눈에","소진 임박 알림부터 장보기 목록까지 자동으로")+phone_frame(inner,"재고"))

# ---------- 이미지 4: 기록/비교 ----------
inner=""
inner+=card(44,10,632,430)
inner+=txt(80,70,"주별 급여표",31,INK,"bold")+txt(640,70,"07-05 ~ 07-11",25,MUTED,"normal","end")
# grid header
gx=[84,236,366,496,608]
heads=["요일","아침","점심","저녁","합계"]
inner+=rect(64,96,592,56,12,SAGEL)
for i,htxt in enumerate(heads):
    inner+=txt(gx[i],134,htxt,25,SAGED,"bold","start" if i==0 else "middle")
data=[("월","140g 93%","120g 89%","150g 96%","410g"),("화","135g 90%","130g 95%","145g 92%","410g"),("수","150g 98%","125g 88%","140g 90%","415g")]
yy=196
for row in data:
    inner+=txt(gx[0],yy,row[0],27,INK,"bold")
    for i in range(1,4):
        g,p=row[i].split(); inner+=txt(gx[i],yy-10,g,27,INK,"bold","middle")+txt(gx[i],yy+24,p,21,SAGED,"bold","middle")
    inner+=txt(gx[4],yy,row[4],27,SAGED,"bold","middle")
    yy+=86
# 비교표
inner+=card(44,470,632,540)
inner+=txt(80,532,"계획 대비 기록",31,INK,"bold")+txt(640,532,"07-05 · 아침",24,MUTED,"normal","end")
inner+=rect(64,560,592,52,12,SAGEL)
cols=[100,340,460,600]
for i,htxt in enumerate(["재료","계획","기록","증감"]):
    inner+=txt(cols[i],596,htxt,24,SAGED,"bold","start" if i==0 else "end")
comp=[("죽",C_CARB,"80g","80g","—",MUTED),("소고기",C_PROT,"15g","20g","+5g",APR),("브로콜리",C_VEG,"15g","15g","—",MUTED),("당근",C_VEG,"—","15g","추가",SAGED),("시금치",C_VEG,"15g","—","빠짐",APR)]
yy=666
for name,color,plan,act,diff,dc in comp:
    inner+=dot(100,yy-9,9,color)+txt(126,yy,name,27,INK)
    inner+=txt(cols[1],yy,plan,26,SOFT,"normal","end")+txt(cols[2],yy,act,26,INK,"bold","end")+txt(cols[3],yy,diff,26,dc,"bold","end")
    yy+=64
inner+=f'<line x1="80" y1="{yy-30}" x2="640" y2="{yy-30}" stroke="{BORDER}" stroke-width="2" stroke-dasharray="8 8"/>'
inner+=txt(100,yy+24,"합계",27,INK,"bold")+txt(cols[1],yy+24,"125g",26,SOFT,"normal","end")+txt(cols[2],yy+24,"130g",26,INK,"bold","end")+txt(cols[3],yy+24,"+5g",26,APR,"bold","end")
inner+=card(44,1040,632,90,20,SAGEL,SAGEL)
inner+=txt(360,1096,"기록은 저장 당시의 식단표 기준으로 비교돼요",25,SAGED,"bold","middle")
img4=svg_doc(header_zone(4,5,"계획 대비 급여 기록 비교","무엇을 얼마나 먹었는지, 달라진 재료까지 한눈에")+phone_frame(inner,"기록"))

# ---------- 이미지 5: 가족 공유 + 위키 ----------
inner=""
inner+=card(44,10,632,250,26,SAGEL,SAGEL)
inner+=txt(360,66,"초대 코드",26,SAGED,"bold","middle")
inner+=txt(360,150,"H3K9PQ",64,SAGED,"bold","middle")
inner+=pill(230,182,260,54,"코드 복사",26,SURF,SAGED)
inner+=txt(360,300,"코드 하나로 배우자와 실시간 공유 · 동시에 기록해도 안전하게 합쳐져요",22,MUTED,"normal","middle")
# 위키
inner+=card(44,330,632,700)
inner+=txt(80,392,"재료 정보 (위키)",31,INK,"bold")+txt(640,392,"24/52 먹어봄",25,SAGED,"bold","end")
wik=[("시금치",C_VEG,"철분 · 베타카로틴 · 옥살산",True,1.0),("소고기",C_PROT,"철분 · 지방",True,1.0),
     ("사과퓨레",C_FRUIT,"사과의 변형",True,1.0),("감뚝큐브",C_VEG,"혼합: 배 · 무 · 양파",True,1.0),
     ("케일",C_VEG,"비타민C · 베타카로틴 · 칼슘",False,0.45),("오리고기",C_PROT,"철분 · 지방",False,0.45)]
yy=430
for name,color,sub,eaten,op in wik:
    inner+=f'<g opacity="{op}">'
    inner+=dot(92,yy+40,9,color)+txt(118,yy+50,name,29,INK,"bold" if eaten else "normal")
    if eaten: inner+=f'<path d="M {118+len(name)*29+16} {yy+36} l 10 12 l 20 -24" stroke="{SAGE}" stroke-width="5" fill="none" stroke-linecap="round"/>'
    inner+=txt(640,yy+48,sub,22,MUTED,"normal","end")
    inner+='</g>'
    if yy<950: inner+=f'<line x1="80" y1="{yy+78}" x2="640" y2="{yy+78}" stroke="{BORDER}" stroke-width="2"/>'
    yy+=94
inner+=txt(80,1005,"영양 DB 50여 개 재료 + 변형·혼합 큐브 분류까지",23,MUTED)
inner+=card(44,1060,632,90,20,BUTL,BUTL)
inner+=txt(360,1116,"먹어본 재료는 진하게, 주의 재료는 따로 표시돼요",25,"#9A7416","bold","middle")
img5=svg_doc(header_zone(5,5,"가족 실시간 공유 · 재료 위키","부부가 함께 보고, 재료 지식은 앱이 채워줘요")+phone_frame(inner,"공유 · 재료 정보"))

names=["01_overview","02_meal_pairing","03_stock","04_records","05_family_wiki"]
for name,svg in zip(names,[img1,img2,img3,img4,img5]):
    p_svg=os.path.join(OUT,f"{name}.svg"); p_png=os.path.join(OUT,f"{name}.png")
    open(p_svg,"w",encoding="utf-8").write(svg)
    cairosvg.svg2png(bytestring=svg.encode(),write_to=p_png,output_width=1080,output_height=1920)
    print(name,"ok",os.path.getsize(p_png)//1024,"KB")
