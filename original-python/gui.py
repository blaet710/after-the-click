import tkinter as tk
from tkinter import messagebox
import random, os, threading, time, math

try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    pygame = None
    PYGAME_AVAILABLE = False

BG = '#0b0b0e'
PANEL = '#17171d'
PANEL2 = '#22222b'
RED = '#d9364f'
WHITE = '#f2f2f5'
GRAY = '#9b9ba8'
GREEN = '#61d6a1'
MAX_HP = 3
ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')

CARDS = [
    {'name':'방어막','description':'다음 판정 실패로 인한 피해를 막습니다.','effect':'shield','color':'#477bd1'},
    {'name':'행운','description':'다음 생존 판정의 성공 확률이 증가합니다.','effect':'luck','color':'#b28b31'},
    {'name':'정찰','description':'현재 가상 위험 수치를 확인합니다.','effect':'scout','color':'#278ca1'},
    {'name':'회복','description':'목숨을 1 회복합니다. 최대 3입니다.','effect':'heal','color':'#32885d'},
    {'name':'방해','description':'상대 한 명의 다음 턴을 건너뛰게 합니다.','effect':'skip','color':'#8654b5'},
    {'name':'보호','description':'다음 판정 실패로 인한 피해를 막습니다.','effect':'protect','color':'#66667d'},
]
def draw_card(): return random.choice(CARDS).copy()

class Player:
    def __init__(self, name):
        self.name=name; self.hp=MAX_HP; self.cards=[draw_card()]; self.alive=True
        self.shield=False; self.protected=False; self.lucky=False; self.skip_next_turn=False

class RouletteGUI:
    def __init__(self, root):
        self.root=root; root.title('AFTER THE CLICK — CARD SURVIVAL')
        root.geometry('1280x800'); root.minsize(1000,680); root.configure(bg=BG)
        self.players=[]; self.current_index=0; self.cycle=1; self.danger=random.randint(20,50)
        self.game_over=False; self.busy=False; self.audio_ready=False; self.music_started=False
        self.card_window=None; self.target_window=None; self.card_hover=False; self.card_anim_step=0
        self.setup_audio(); self.build_start_screen()

    def setup_audio(self):
        if not PYGAME_AVAILABLE: return
        try:
            pygame.mixer.init(); self.audio_ready=True
            path=os.path.join(ASSET_DIR,'music.mp3')
            if os.path.exists(path):
                pygame.mixer.music.load(path); pygame.mixer.music.set_volume(.35); pygame.mixer.music.play(-1,fade_ms=900); self.music_started=True
        except Exception: self.audio_ready=False
    def play_sound(self, filename, volume=.75):
        if not self.audio_ready: return
        path=os.path.join(ASSET_DIR,filename)
        if os.path.exists(path):
            try:
                s=pygame.mixer.Sound(path); s.set_volume(volume); s.play()
            except Exception: pass
    def duck_music_then_restore(self, pause_seconds=.8):
        if not self.audio_ready or not self.music_started: return
        def worker():
            try:
                start=pygame.mixer.music.get_volume()
                for i in range(8): pygame.mixer.music.set_volume(start*(1-(i+1)/8)); time.sleep(.045)
                time.sleep(pause_seconds)
                for i in range(16): pygame.mixer.music.set_volume(start*((i+1)/16)); time.sleep(.075)
            except Exception: pass
        threading.Thread(target=worker,daemon=True).start()
    def button(self,parent,text,command,bg=RED,**kw):
        return tk.Button(parent,text=text,command=command,bg=bg,fg=WHITE,activebackground='#f14c63',activeforeground=WHITE,relief='flat',bd=0,cursor='hand2',font=('Malgun Gothic',10,'bold'),padx=12,pady=9,**kw)
    def label(self,parent,text,size=11,color=WHITE,bold=False,bg=None,**kw):
        return tk.Label(parent,text=text,bg=bg or parent.cget('bg'),fg=color,font=('Malgun Gothic',size,'bold' if bold else 'normal'),**kw)
    def clear_screen(self):
        for w in self.root.winfo_children(): w.destroy()
    def build_start_screen(self):
        self.game_over=False; self.clear_screen()
        box=tk.Frame(self.root,bg=BG); box.pack(expand=True)
        self.label(box,'AFTER THE',38,WHITE,True,BG).pack()
        self.label(box,'CLICK',54,RED,True,BG).pack()
        self.label(box,'A CARD-BASED SURVIVAL GAME',11,GRAY,bg=BG).pack(pady=(5,28))
        self.label(box,'플레이어 수',12,bg=BG).pack()
        self.player_count=tk.IntVar(value=3)
        tk.Spinbox(box,from_=2,to=6,textvariable=self.player_count,width=8,justify='center',font=('Arial',16),bg=PANEL,fg=WHITE,buttonbackground=RED).pack(pady=10)
        self.button(box,'게임 시작',self.ask_player_names,width=20).pack(pady=12)
        self.label(box,'LOCAL GAME  •  AUDIO OPTIONAL',9,GRAY,bg=BG).pack(pady=15)
    def ask_player_names(self):
        try: count=int(self.player_count.get())
        except Exception: messagebox.showerror('오류','플레이어 수를 확인해 주세요.'); return
        if not 2<=count<=6: messagebox.showerror('오류','플레이어는 2~6명이어야 합니다.'); return
        self.clear_screen(); box=tk.Frame(self.root,bg=BG); box.pack(expand=True)
        self.label(box,'PLAYER SETUP',25,RED,True,BG).pack(pady=20); self.name_entries=[]
        for i in range(count):
            row=tk.Frame(box,bg=BG); row.pack(pady=7)
            self.label(row,f'PLAYER {i+1}',11,bg=BG).pack(side='left',padx=10)
            e=tk.Entry(row,font=('Malgun Gothic',12),bg=PANEL,fg=WHITE,insertbackground=WHITE,relief='flat',width=22)
            e.insert(0,f'플레이어 {i+1}'); e.pack(side='left',ipady=6); self.name_entries.append(e)
        self.button(box,'게임 시작',self.start_game,width=20).pack(pady=25)
    def start_game(self):
        names=[e.get().strip() for e in self.name_entries]
        if any(not n for n in names) or len(set(names))!=len(names): messagebox.showerror('오류','이름을 모두 입력하고 서로 다르게 설정해 주세요.'); return
        self.players=[Player(n) for n in names]; self.current_index=0; self.cycle=1; self.danger=random.randint(20,50); self.game_over=False; self.busy=False
        self.build_game_screen(); self.update_screen(); self.log('게임 시작! 모든 플레이어가 무작위 카드 1장을 받았습니다.'); self.play_sound('click.wav',.5)
    def build_game_screen(self):
        self.clear_screen()
        header=tk.Frame(self.root,bg=BG); header.pack(fill='x',padx=22,pady=(14,8))
        self.label(header,'AFTER THE CLICK',22,RED,True,BG).pack(side='left')
        self.cycle_label=self.label(header,'CYCLE 01',12,WHITE,True,BG); self.cycle_label.pack(side='right')
        body=tk.Frame(self.root,bg=BG); body.pack(fill='both',expand=True,padx=18,pady=6)
        # Left player rail, similar to the supplied sketch
        left=tk.Frame(body,bg=PANEL,width=218); left.pack(side='left',fill='y',padx=(0,12)); left.pack_propagate(False)
        self.label(left,'PLAYERS',13,RED,True,PANEL).pack(anchor='w',padx=14,pady=(15,8))
        self.player_list=tk.Frame(left,bg=PANEL); self.player_list.pack(fill='x',padx=9)
        # Center stage
        center=tk.Frame(body,bg=BG); center.pack(side='left',fill='both',expand=True)
        self.turn_label=self.label(center,'현재 턴',21,WHITE,True,BG); self.turn_label.pack(anchor='w',pady=(2,3))
        self.status_label=self.label(center,'',10,GRAY,bg=BG); self.status_label.pack(anchor='w')
        stage=tk.Frame(center,bg='#101015',highlightbackground='#34343d',highlightthickness=1); stage.pack(fill='both',expand=True,pady=(13,10))
        self.stage_canvas=tk.Canvas(stage,bg='#101015',highlightthickness=0); self.stage_canvas.pack(fill='both',expand=True)
        self.stage_canvas.bind('<Configure>',lambda e:self.draw_stage())
        self.stage_text=self.label(center,'차례가 되면 [턴 진행]을 눌러 주세요.',10,GRAY,bg=BG); self.stage_text.pack(anchor='center',pady=(0,7))
        # Right card / action panel
        right=tk.Frame(body,bg=PANEL,width=205); right.pack(side='right',fill='y',padx=(12,0)); right.pack_propagate(False)
        self.label(right,'CARD DETAILS',12,RED,True,PANEL).pack(anchor='w',padx=13,pady=(15,9))
        self.card_art=tk.Canvas(right,width=160,height=185,bg=PANEL,highlightthickness=0); self.card_art.pack(pady=2)
        self.card_detail=self.label(right,'카드를 골라 주세요.',10,WHITE,bg=PANEL,wraplength=175,justify='left'); self.card_detail.pack(anchor='w',padx=14,pady=10)
        self.button(right,'카드 선택',self.open_card_window,width=16).pack(fill='x',padx=10,pady=(8,6))
        self.button(right,'턴 진행',self.take_turn,bg='#812433',width=16).pack(fill='x',padx=10,pady=6)
        self.button(right,'효과음 테스트',lambda:self.play_sound('card.wav'),bg=PANEL2,width=16).pack(fill='x',padx=10,pady=6)
        # Bottom cards + hover fan
        bottom=tk.Frame(self.root,bg=BG); bottom.pack(fill='x',padx=22,pady=(0,14))
        self.label(bottom,'YOUR CARDS',12,RED,True,BG).pack(anchor='w',pady=(0,5))
        self.card_frame=tk.Frame(bottom,bg=BG,height=110); self.card_frame.pack(fill='x'); self.card_frame.pack_propagate(False)
        self.log_box=tk.Text(self.root,height=4,bg='#111116',fg='#c8c8d0',insertbackground=WHITE,font=('Malgun Gothic',9),relief='flat',wrap='word',state='disabled')
        self.log_box.pack(fill='x',padx=22,pady=(0,12))
    def draw_avatar(self, canvas, cx, cy, scale=1, color='#050507'):
        # Abstract profile silhouette: head, shoulders and torso only.
        canvas.create_oval(cx-25*scale,cy-48*scale,cx+25*scale,cy+2*scale,fill=color,outline=color)
        canvas.create_oval(cx-18*scale,cy-41*scale,cx+18*scale,cy-5*scale,fill='#101015',outline='#101015')
        canvas.create_arc(cx-58*scale,cy-5*scale,cx+58*scale,cy+80*scale,start=0,extent=180,style='pieslice',fill=color,outline=color)
        canvas.create_rectangle(cx-58*scale,cy+35*scale,cx+58*scale,cy+72*scale,fill=color,outline=color)
    def draw_stage(self):
        if not hasattr(self,'stage_canvas') or not self.stage_canvas.winfo_exists(): return
        c=self.stage_canvas; c.delete('all'); w=max(c.winfo_width(),300); h=max(c.winfo_height(),200)
        p=self.current_player() if self.players and not self.game_over else None
        c.create_oval(w*.5-125,h*.5-125,w*.5+125,h*.5+125,outline='#303039',width=2)
        c.create_oval(w*.5-112,h*.5-112,w*.5+112,h*.5+112,outline='#202028',width=1)
        self.draw_avatar(c,w*.5,h*.43,1.15,'#020204')
        c.create_text(w*.5,h*.80,text=(p.name if p else 'WAITING'),fill=WHITE,font=('Malgun Gothic',16,'bold'))
        c.create_text(w*.5,h*.88,text='THE NEXT RESULT IS UNKNOWN',fill=GRAY,font=('Arial',9,'bold'))
        c.create_line(w*.15,h*.95,w*.85,h*.95,fill='#34343d',width=2)
    def log(self,text):
        if not hasattr(self,'log_box') or not self.log_box.winfo_exists(): return
        self.log_box.configure(state='normal'); self.log_box.insert('end',text+'\n'); self.log_box.see('end'); self.log_box.configure(state='disabled')
    def alive_players(self): return [p for p in self.players if p.alive]
    def current_player(self):
        if not self.players: return None
        if not self.players[self.current_index].alive:
            inds=[i for i,p in enumerate(self.players) if p.alive]
            if not inds: return None
            self.current_index=inds[0]
        return self.players[self.current_index]
    def update_screen(self):
        if self.game_over:return
        p=self.current_player()
        if not p:self.finish_game();return
        self.cycle_label.config(text=f'CYCLE {self.cycle:02d}'); self.turn_label.config(text=f'현재 턴: {p.name}')
        self.status_label.config(text=f'목숨 {p.hp}/{MAX_HP}  •  보유 카드 {len(p.cards)}장')
        for w in self.player_list.winfo_children():w.destroy()
        for i,pl in enumerate(self.players):
            card=tk.Frame(self.player_list,bg=('#3a2028' if pl is p and pl.alive else PANEL2 if pl.alive else '#111114'))
            card.pack(fill='x',pady=4)
            av=tk.Canvas(card,width=52,height=58,bg=card.cget('bg'),highlightthickness=0); av.pack(side='left',padx=4,pady=4)
            self.draw_avatar(av,26,26,.34,'#08080a' if pl.alive else '#33333a')
            txt=f'{pl.name}\n♥ {pl.hp}/{MAX_HP}' if pl.alive else f'{pl.name}\n탈락'
            self.label(card,txt,9,RED if pl is p and pl.alive else (GRAY if not pl.alive else WHITE),True,card.cget('bg'),justify='left').pack(side='left',padx=5)
        for w in self.card_frame.winfo_children():w.destroy()
        self.card_buttons=[]
        if not p.cards:self.label(self.card_frame,'보유한 카드가 없습니다.',10,GRAY,bg=BG).pack(anchor='w')
        else:
            # Fan-like hand. Hovering any card animates the hand into a spread.
            holder=tk.Frame(self.card_frame,bg=BG); holder.pack(fill='both',expand=True)
            holder.bind('<Enter>',lambda e:self.animate_hand(holder,True)); holder.bind('<Leave>',lambda e:self.animate_hand(holder,False))
            n=len(p.cards); card_w=115; overlap=48 if n>3 else 10
            total=card_w+(n-1)*(card_w-overlap); total=min(total,900)
            for i,card in enumerate(p.cards):
                b=tk.Button(holder,text=f"✦\n{card['name']}",font=('Malgun Gothic',10,'bold'),fg=WHITE,bg=card['color'],activebackground='#f14c63',relief='flat',bd=0,cursor='hand2',command=lambda:self.open_card_window())
                x=8+i*(card_w-overlap); b.place(x=x,y=24,width=card_w,height=78)
                b.bind('<Enter>',lambda e,h=holder:self.animate_hand(h,True)); b.bind('<Leave>',lambda e,h=holder:self.root.after(100,lambda:self.check_hand_leave(h)))
                self.card_buttons.append(b)
        self.draw_stage(); self.draw_card_art()
    def animate_hand(self,holder,spread):
        if not holder.winfo_exists():return
        self.card_hover=spread; n=len(self.card_buttons)
        if not n:return
        for i,b in enumerate(self.card_buttons):
            x=8+i*(110 if spread else (48 if n>3 else 105))
            y=2 if spread else 24
            b.place_configure(x=x,y=y,width=115,height=88 if spread else 78)
            if spread:b.lift()
    def check_hand_leave(self,holder):
        try:
            x,y=self.root.winfo_pointerxy(); widget=self.root.winfo_containing(x,y)
            if widget is None or not str(widget).startswith(str(holder)): self.animate_hand(holder,False)
        except Exception: self.animate_hand(holder,False)
    def draw_card_art(self):
        c=self.card_art;c.delete('all'); c.create_rectangle(12,8,148,178,fill='#292934',outline=RED,width=2)
        c.create_text(80,28,text='UNKNOWN',fill=GRAY,font=('Arial',8,'bold'))
        c.create_text(80,85,text='✦',fill=RED,font=('Arial',42,'bold'))
        c.create_text(80,145,text='FATE CARD',fill=WHITE,font=('Arial',10,'bold'))
    def open_card_window(self):
        if self.busy or self.game_over:return
        p=self.current_player()
        if not p or not p.cards:messagebox.showinfo('카드','보유한 카드가 없습니다.');return
        if self.card_window and self.card_window.winfo_exists():self.card_window.destroy()
        win=tk.Toplevel(self.root);self.card_window=win;win.title('카드 선택');win.geometry('640x420');win.configure(bg=BG);win.transient(self.root);win.grab_set()
        self.label(win,f'{p.name}의 카드',18,RED,True,BG).pack(anchor='w',padx=18,pady=14)
        area=tk.Frame(win,bg=BG);area.pack(fill='both',expand=True,padx=15)
        cards_area=tk.Frame(area,bg=BG);cards_area.pack(side='left',fill='both',expand=True)
        detail=tk.Label(area,text='카드에 마우스를 올려 설명을 확인하세요.',bg=PANEL,fg=WHITE,font=('Malgun Gothic',10),wraplength=180,justify='left',padx=12,pady=12);detail.pack(side='right',fill='y',padx=(12,0))
        selected=tk.IntVar(value=-1); buttons=[]
        def choose(i):
            selected.set(i);card=p.cards[i];detail.config(text=f"{card['name']}\n\n{card['description']}")
            for j,b in enumerate(buttons):b.config(highlightthickness=2 if i==j else 0,highlightbackground=WHITE)
        for i,card in enumerate(p.cards):
            b=tk.Button(cards_area,text=f"✦\n{card['name']}\n\n카드 {i+1}",bg=card['color'],fg=WHITE,activebackground='#f14c63',relief='flat',font=('Malgun Gothic',10,'bold'),cursor='hand2',command=lambda j=i:choose(j))
            b.pack(side='left',fill='y',expand=True,padx=4,pady=12);b.bind('<Enter>',lambda e,j=i:choose(j));buttons.append(b)
        row=tk.Frame(win,bg=BG);row.pack(fill='x',padx=18,pady=14)
        def use():
            i=selected.get()
            if i<0:messagebox.showinfo('카드','사용할 카드를 선택해 주세요.',parent=win);return
            card=p.cards[i]
            if card['effect']=='heal' and p.hp>=MAX_HP:messagebox.showinfo('사용 불가','목숨이 이미 최대입니다.',parent=win);return
            if card['effect']=='skip':win.destroy();self.choose_target(i);return
            self.apply_card(p,i);win.destroy()
        self.button(row,'카드 사용',use).pack(side='left');self.button(row,'닫기',win.destroy,bg=PANEL2).pack(side='right');self.play_sound('click.wav',.4)
    def choose_target(self,card_index):
        p=self.current_player();targets=[x for x in self.alive_players() if x is not p]
        if not targets:messagebox.showinfo('대상','선택할 상대가 없습니다.');return
        win=tk.Toplevel(self.root);self.target_window=win;win.title('대상 선택');win.geometry('420x400');win.configure(bg='#101015');win.transient(self.root);win.grab_set()
        self.label(win,'대상을 선택하세요',18,RED,True,'#101015').pack(pady=20)
        for target in targets:self.button(win,f'{target.name}  •  HP {target.hp}/{MAX_HP}',lambda t=target:(win.destroy(),self.apply_card(p,card_index,t)),bg='#762634',width=25).pack(pady=7)
        self.button(win,'취소',win.destroy,bg=PANEL2).pack(pady=12)
    def apply_card(self,p,index,target=None):
        if not p.alive or index>=len(p.cards):return
        card=p.cards[index];e=card['effect']
        if e=='heal' and p.hp>=MAX_HP:messagebox.showinfo('사용 불가','목숨이 이미 최대입니다.');return
        if e=='shield' and p.shield:messagebox.showinfo('사용 불가','방어막이 이미 활성화되어 있습니다.');return
        if e=='protect' and p.protected:messagebox.showinfo('사용 불가','보호가 이미 활성화되어 있습니다.');return
        p.cards.pop(index)
        if e=='shield':p.shield=True
        elif e=='luck':p.lucky=True
        elif e=='scout':messagebox.showinfo('정찰',f'현재 가상 위험 수치: {self.danger}%')
        elif e=='heal':p.hp=min(MAX_HP,p.hp+1)
        elif e=='skip' and target:target.skip_next_turn=True;self.log(f'{target.name}의 다음 턴이 건너뛰어집니다.')
        elif e=='protect':p.protected=True
        self.log(f'{p.name}: [{card["name"]}] 카드 사용');self.play_sound('card.wav');self.update_screen()
    def take_turn(self):
        if self.busy or self.game_over:return
        p=self.current_player()
        if not p:self.finish_game();return
        self.busy=True;self.cinematic_player=p
        overlay=tk.Toplevel(self.root);self.cinematic=overlay;overlay.overrideredirect(True)
        overlay.geometry(f'{self.root.winfo_width()}x{self.root.winfo_height()}+{self.root.winfo_rootx()}+{self.root.winfo_rooty()}');overlay.configure(bg='#050507');overlay.attributes('-alpha',.97);overlay.transient(self.root)
        c=tk.Canvas(overlay,bg='#050507',highlightthickness=0);c.pack(fill='both',expand=True)
        self.cinematic_canvas=c;self.cinematic_step=0
        self._cinematic_lines=[f'{p.name}의 차례','주변이 조용해진다…','결과를 확인합니다']
        self._cinematic_tick();self.play_sound('click.wav',.3)
    def _cinematic_tick(self):
        if not self.cinematic.winfo_exists():self.busy=False;return
        c=self.cinematic_canvas;c.delete('all');w=max(c.winfo_width(),500);h=max(c.winfo_height(),400)
        idx=self.cinematic_step
        if idx<3:
            c.create_oval(w/2-100,h/2-145,w/2+100,h/2+55,outline='#292932',width=2)
            self.draw_avatar(c,w/2,h/2-30,1.1,'#020204')
            c.create_text(w/2,h*.76,text=self._cinematic_lines[idx],fill=WHITE,font=('Malgun Gothic',22,'bold'))
            c.create_text(w/2,h*.84,text='• • •',fill=RED,font=('Arial',18,'bold'))
            self.cinematic_step+=1;self.root.after(750,self._cinematic_tick)
        else:self._resolve_cinematic()
    def _resolve_cinematic(self):
        p=self.cinematic_player
        if p.skip_next_turn:
            p.skip_next_turn=False;self.log(f'{p.name}의 턴이 건너뛰어졌습니다.');self._show_result('턴 건너뛰기',GRAY,False);return
        chance=self.danger
        if p.lucky:chance=max(5,chance-15);p.lucky=False
        failed=random.randint(1,100)<=chance
        if failed:
            if p.shield:p.shield=False;text='방어막 발동!';self.play_sound('blank.wav')
            elif p.protected:p.protected=False;text='보호 효과 발동!';self.play_sound('blank.wav')
            else:
                p.hp-=1;text='판정 실패';self.play_sound('impact.wav');self.duck_music_then_restore(.85)
                if p.hp<=0:p.alive=False
            self._blackout=True
        else:text='공포탄 — 다음 턴으로';self.play_sound('blank.wav');self._blackout=False
        self.log(f'{p.name}: {text}')
        if not p.alive:self.log(f'{p.name} 탈락!')
        self._show_result(text,RED if failed else GREEN,failed)
    def _show_result(self,text,color,blackout):
        c=self.cinematic_canvas;c.delete('all');w=max(c.winfo_width(),500);h=max(c.winfo_height(),400)
        c.configure(bg='#000000' if blackout else '#101015')
        if blackout:
            # Abstract blackout: no depiction of a weapon or bodily impact.
            c.create_rectangle(0,0,w,h,fill='#000000',outline='#000000')
            c.create_text(w/2,h/2,text=' ',fill='#000000')
            self.root.after(500,lambda:self._reveal_result(text,color))
        else:
            c.create_text(w/2,h/2-20,text=text,fill=color,font=('Malgun Gothic',25,'bold'))
            c.create_text(w/2,h/2+35,text='다음 플레이어로 이동합니다',fill=GRAY,font=('Malgun Gothic',11))
            self.root.after(450,self._finish_turn)
    def _reveal_result(self,text,color):
        if not self.cinematic.winfo_exists():return
        c=self.cinematic_canvas;c.configure(bg='#050507');c.delete('all');w=max(c.winfo_width(),500);h=max(c.winfo_height(),400)
        c.create_text(w/2,h/2-20,text=text,fill=color,font=('Malgun Gothic',25,'bold'))
        c.create_text(w/2,h/2+35,text='다음 플레이어로 이동합니다',fill=GRAY,font=('Malgun Gothic',11))
        self.root.after(900,self._finish_turn)
    def _finish_turn(self):
        if hasattr(self,'cinematic') and self.cinematic.winfo_exists():self.cinematic.destroy()
        self.busy=False;self.danger=random.randint(20,50)
        alive=[i for i,p in enumerate(self.players) if p.alive]
        if len(alive)<=1:self.finish_game();return
        nexts=[i for i in alive if i>self.current_index]
        if nexts:self.current_index=nexts[0]
        else:
            self.finish_cycle()
            if self.game_over:return
            alive=[i for i,p in enumerate(self.players) if p.alive]
            if len(alive)<=1:self.finish_game();return
            self.current_index=alive[0]
        self.update_screen()
    def finish_cycle(self):
        self.log(f'사이클 {self.cycle} 종료!')
        for p in self.alive_players():
            card=draw_card();p.cards.append(card);self.log(f'{p.name}: [{card["name"]}] 카드 획득')
        self.cycle+=1;self.log(f'사이클 {self.cycle} 시작!')
    def finish_game(self):
        self.game_over=True;survivors=self.alive_players();msg=f'최종 승자: {survivors[0].name}' if len(survivors)==1 else '게임 종료!'
        self.clear_screen();box=tk.Frame(self.root,bg=BG);box.pack(expand=True)
        self.label(box,'GAME OVER',38,RED,True,BG).pack(pady=15);self.label(box,msg,22,WHITE,True,BG).pack(pady=20)
        self.button(box,'다시 시작',self.build_start_screen,width=20).pack(pady=10);self.button(box,'종료',self.root.destroy,bg=PANEL2,width=20).pack(pady=10)

if __name__=='__main__':
    root=tk.Tk();app=RouletteGUI(root);root.mainloop()
