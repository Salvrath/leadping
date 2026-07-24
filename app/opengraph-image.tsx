import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Textback – Missa samtalet, inte kunden";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{width:"100%",height:"100%",display:"flex",background:"#f8fbff",color:"#10213f",fontFamily:"Arial, sans-serif",padding:"64px 72px",position:"relative",overflow:"hidden"}}>
      <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",width:"62%"}}>
        <div style={{display:"flex",alignItems:"center",gap:20,fontSize:46,fontWeight:800}}><div style={{width:72,height:72,borderRadius:20,background:"#1976d2",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>↩</div>Textback</div>
        <div><div style={{fontSize:76,fontWeight:850,lineHeight:1.04,letterSpacing:"-3px"}}>Missa samtalet –<br/>inte kunden.</div><div style={{fontSize:30,lineHeight:1.35,marginTop:28,color:"#40516f"}}>Automatiskt SMS vid missat samtal för företag som lever på inkommande samtal.</div></div>
        <div style={{fontSize:24,color:"#1976d2",fontWeight:700}}>textback.se</div>
      </div>
      <div style={{width:"38%",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:340,height:430,border:"12px solid #10213f",borderRadius:48,background:"white",padding:28,display:"flex",flexDirection:"column",gap:28,boxShadow:"0 24px 60px rgba(16,33,63,.16)"}}><div style={{fontSize:24,fontWeight:700}}>Missat samtal</div><div style={{padding:24,borderRadius:24,background:"#eaf3ff",fontSize:25,lineHeight:1.35}}>Hej! Du ringde precis till oss. Vad behöver du hjälp med?</div><div style={{padding:24,borderRadius:24,background:"#10213f",color:"white",fontSize:25,lineHeight:1.35}}>Jag vill gärna få en offert.</div></div></div>
      <div style={{position:"absolute",right:-120,top:-120,width:360,height:360,borderRadius:999,background:"rgba(25,118,210,.08)"}}/>
    </div>, size
  );
}