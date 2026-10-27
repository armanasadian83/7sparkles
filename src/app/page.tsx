import Image from "next/image";
import { Storefront } from "@/components/storefront";
import { Icon, Star } from "@/components/icons";
import { GalaxyHero } from "@/components/galaxy-hero";
function Hero() {
  return <><GalaxyHero /><div className="service-strip container">
      <div className="service-item"><span className="service-icon"><Icon name="leaf" size={28} /></span><div><h3>انتخاب تخصصی محصولات</h3><p>با دقت، برای زیبایی واقعی تو</p></div></div>
      <div className="service-item"><span className="service-icon"><Icon name="globe" size={28} /></span><div><h3>برندهای معتبر جهانی</h3><p>دنیای مراقبت، نزدیک‌تر به تو</p></div></div>
      <div className="service-item"><span className="service-icon"><Icon name="hand" size={28} /></span><div><h3>همراه مسیر مراقبت تو</h3><p>از اولین انتخاب تا روتین دلخواهت</p></div></div>
    </div></>;
}
function Story() {
  return <section id="about" className="story-section container" aria-labelledby="story-title">
    <div className="story-photo"><Image src="/images/seven-sparkles-boutique.png" alt="فضای فروشگاه سون اسپارکلز با قفسه‌های روشن و محصولات مراقبت پوست و مو" fill sizes="(max-width: 700px) 100vw, 50vw" /><span className="photo-signature" dir="ltr">THE SEVEN SPARKLES EXPERIENCE</span></div>
    <div className="story-copy"><div className="story-orbit" aria-hidden="true"><Star /></div><h2 id="story-title">اینجا، هر مراقبت<br /><span>یک درخشش تازه است</span></h2><p>سون اسپارکلز، جایی برای کشف دنیای مراقبت از پوست و مو. ما به انتخاب آگاهانه و زیبایی منحصربه‌فرد هر فرد باور داریم؛ از اولین قدم روتین تا مراقبت‌های تخصصی.</p><p className="story-secondary">همان حس آرامش و توجهی که در فروشگاه ما تجربه می‌کنی، اینجا هم همراه توست.</p><a className="text-link" href="#brands">دنیای برندهای ما را کشف کن <Icon name="arrow" size={23} /></a><Star className="story-star" /></div>
  </section>;
}
export default function Home() { return <Storefront hero={<Hero />} story={<Story />} />; }
