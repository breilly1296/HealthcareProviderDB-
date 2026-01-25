import {
  HeroSection,
  WhyItMattersSection,
  HowItWorksSection,
  ConfidenceSection,
  CTASection,
} from '@/components/home';

export default function HomePage() {
  return (
    <div>
      <HeroSection />
      <WhyItMattersSection />
      <HowItWorksSection />
      <ConfidenceSection />
      <CTASection />
    </div>
  );
}
