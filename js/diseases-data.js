/*
 * Educational content used by the Eye Disease Guide.
 * Stable IDs allow future examination results to link to disease-details.html?id=<id>.
 *
 * IMPORTANT: The Fundus conditions below are provisional interface categories.
 * Replace the final Fundus classes when the training dataset has been selected.
 */
window.EYECARE_DISEASES = [
  {
    id: "normal-retina",
    name: "Normal Retina",
    shortName: "Normal Retina",
    examinationType: "OCT",
    shortDescription: "An OCT appearance in which the retinal layers and central macular contour are within expected limits.",
    overview: "A normal retinal OCT shows the retina's layers in an expected arrangement without obvious swelling, fluid, or disruptive structural change. A normal-looking scan is only one part of an eye assessment and must be interpreted with symptoms and a full examination.",
    symptoms: ["No condition-specific symptoms are expected", "Vision may still change for reasons that are not visible on one OCT scan"],
    riskFactors: ["Not applicable as a disease category", "Routine eye-care needs still vary with age, health, and family history"],
    examination: ["Visual acuity testing", "Dilated eye examination when appropriate", "OCT imaging interpreted by an eye-care professional"],
    generalTreatment: ["No treatment is needed for a normal OCT appearance", "Routine eye examinations may still be recommended based on individual needs"],
    whenToSeekCare: "Arrange an eye examination for new or persistent vision changes. Seek urgent care for sudden vision loss, a curtain-like shadow, new flashes, or a rapid increase in floaters."
  },
  {
    id: "cnv",
    name: "Choroidal Neovascularization",
    shortName: "CNV",
    examinationType: "OCT",
    shortDescription: "Growth of abnormal blood vessels beneath the retina that may leak fluid or blood and affect central vision.",
    overview: "Choroidal neovascularization (CNV) occurs when abnormal blood vessels grow beneath the retina. These fragile vessels can leak and damage the macula, the retinal area responsible for detailed central vision. CNV can occur with wet age-related macular degeneration, pathologic myopia, and some other retinal conditions.",
    symptoms: ["Blurred or distorted central vision", "Straight lines appearing wavy", "A dark or blank area near the center of vision", "Reduced detail or color clarity"],
    riskFactors: ["Age-related macular degeneration", "Pathologic or high myopia", "Previous inflammation or injury affecting the retina", "Certain inherited or retinal disorders"],
    examination: ["Dilated retinal examination", "OCT to look for fluid and structural change", "OCT angiography or fluorescein angiography when clinically appropriate"],
    generalTreatment: ["Eye specialists commonly use anti-VEGF injections to reduce leakage and abnormal vessel activity", "Photodynamic therapy may be considered in selected cases", "The underlying retinal condition also needs monitoring"],
    whenToSeekCare: "Contact an eye-care professional promptly if straight lines suddenly look wavy or central vision becomes blurred, dark, or distorted."
  },
  {
    id: "dme",
    name: "Diabetic Macular Edema",
    shortName: "DME",
    examinationType: "OCT",
    shortDescription: "Swelling of the macula caused by fluid leaking from retinal blood vessels affected by diabetes.",
    overview: "Diabetic macular edema (DME) is a complication of diabetic retinopathy. Damaged retinal blood vessels leak fluid into the macula, which can blur or distort the central vision used for reading, driving, and recognizing faces.",
    symptoms: ["Blurred central vision", "Wavy or distorted vision", "Colors appearing dull or faded", "Vision changes that may affect one or both eyes"],
    riskFactors: ["Diabetes over a longer period", "Blood glucose that is not well controlled", "High blood pressure or cholesterol", "Existing diabetic retinopathy", "Kidney disease or pregnancy in a person with diabetes"],
    examination: ["Comprehensive dilated eye examination", "OCT to measure retinal swelling", "Retinal photography or fluorescein angiography when needed"],
    generalTreatment: ["Diabetes and blood-pressure management support overall eye health", "An ophthalmologist may recommend anti-VEGF or steroid injections", "Laser treatment or surgery may be considered in selected situations"],
    whenToSeekCare: "People with diabetes should attend regular dilated eye examinations. Arrange prompt care for new blurring, distortion, floaters, or any sudden change in vision."
  },
  {
    id: "drusen",
    name: "Drusen",
    shortName: "Drusen",
    examinationType: "OCT",
    shortDescription: "Small deposits beneath the retina that become more common with age and may be associated with macular degeneration.",
    overview: "Drusen are small deposits that form beneath the retina. A few small drusen can occur with normal aging, while larger or more numerous drusen may be a sign of age-related macular degeneration (AMD). Their presence does not by itself describe how much vision is affected.",
    symptoms: ["Often no symptoms", "Possible mild central blurring or difficulty in low light when associated with AMD", "Distortion or blank areas if macular disease progresses"],
    riskFactors: ["Increasing age", "Family history of AMD", "Smoking", "Cardiovascular risk factors"],
    examination: ["Dilated retinal examination", "Retinal photography", "OCT to assess the macula and tissue beneath it", "Amsler grid testing when advised by an eye-care professional"],
    generalTreatment: ["Small drusen alone may only require observation", "Some people with intermediate AMD may be advised to use specific AREDS2 supplements after professional assessment", "Smoking cessation and management of general health risks may be recommended"],
    whenToSeekCare: "Seek prompt assessment if straight lines become wavy, a central blur or blank spot develops, or vision changes suddenly."
  },
  {
    id: "normal-fundus",
    name: "Normal Fundus",
    shortName: "Normal Fundus",
    examinationType: "Fundus",
    shortDescription: "A retinal photograph with an optic disc, macula, blood vessels, and background appearance within expected limits.",
    overview: "A normal fundus appearance means the visible retina and related structures do not show an obvious abnormality in the photograph. Image quality, areas outside the photograph, symptoms, eye pressure, and other tests still matter in a complete eye examination.",
    symptoms: ["No condition-specific symptoms are expected", "Symptoms can still occur from conditions not visible in a single fundus image"],
    riskFactors: ["Not applicable as a disease category", "Routine screening needs may increase with age, diabetes, high myopia, or family history"],
    examination: ["Visual acuity and eye-health history", "Dilated fundus examination when appropriate", "Fundus photography interpreted by an eye-care professional"],
    generalTreatment: ["No treatment is required for a normal fundus appearance", "Continue routine eye care based on professional advice"],
    whenToSeekCare: "Arrange an assessment for persistent vision concerns. Sudden vision loss, flashes, many new floaters, severe eye pain, or a curtain-like shadow need urgent attention."
  },
  {
    id: "diabetic-retinopathy",
    name: "Diabetic Retinopathy",
    shortName: "Diabetic Retinopathy",
    examinationType: "Fundus",
    shortDescription: "Damage to retinal blood vessels caused by diabetes, which may leak, close, or grow abnormally.",
    overview: "Diabetic retinopathy develops when diabetes damages the small blood vessels of the retina. Early stages may have no symptoms. Later changes can cause leakage, bleeding, abnormal new vessels, retinal swelling, and vision loss.",
    symptoms: ["Often no symptoms in early stages", "Blurred or changing vision", "Dark floating spots or streaks", "Areas of missing vision in advanced disease"],
    riskFactors: ["Any type of diabetes", "Longer duration of diabetes", "Blood glucose, blood pressure, or cholesterol that is not well controlled", "Pregnancy in a person with diabetes", "Kidney disease"],
    examination: ["Comprehensive dilated eye examination", "Fundus photography", "OCT when macular swelling is suspected", "Fluorescein angiography in selected cases"],
    generalTreatment: ["Managing diabetes, blood pressure, and cholesterol helps protect vision", "Some stages require monitoring rather than immediate eye treatment", "Injections, laser treatment, or surgery may be recommended for more advanced changes"],
    whenToSeekCare: "People with diabetes need regular dilated eye examinations even without symptoms. Seek urgent care for sudden vision loss, many new floaters, or a dark curtain in the visual field."
  },
  {
    id: "glaucoma",
    name: "Glaucoma",
    shortName: "Glaucoma",
    examinationType: "Fundus",
    shortDescription: "A group of eye diseases that damage the optic nerve and can gradually reduce vision.",
    overview: "Glaucoma is a group of conditions that damage the optic nerve, which carries visual information from the eye to the brain. The most common type often progresses without early symptoms. Eye pressure is an important risk factor, but glaucoma can occur at different pressure levels.",
    symptoms: ["Often no early symptoms", "Gradual loss of side vision", "Blind spots as damage progresses", "Sudden pain, redness, nausea, and blurred vision in acute angle-closure glaucoma"],
    riskFactors: ["Increasing age", "Family history of glaucoma", "Higher eye pressure", "African, Asian, or Hispanic ancestry depending on glaucoma type", "Diabetes, severe myopia, or previous eye injury"],
    examination: ["Comprehensive dilated eye examination", "Eye-pressure measurement", "Optic nerve assessment and OCT", "Visual field testing", "Examination of the eye's drainage angle when needed"],
    generalTreatment: ["Prescription eye drops are commonly used to lower eye pressure", "Laser treatment may improve fluid drainage", "Surgery may be considered when other treatments are not sufficient", "Treatment aims to protect remaining vision rather than restore lost vision"],
    whenToSeekCare: "Sudden severe eye pain, a red eye, nausea, halos, or blurred vision can be an emergency and needs immediate medical care."
  },
  {
    id: "age-related-macular-degeneration",
    name: "Age-related Macular Degeneration",
    shortName: "AMD",
    examinationType: "Fundus",
    shortDescription: "Age-related damage to the macula that can blur or distort the central vision needed for fine detail.",
    overview: "Age-related macular degeneration (AMD) affects the macula, the central part of the retina. Dry AMD is more common and often progresses slowly. Wet AMD is less common but can cause faster vision loss when abnormal blood vessels grow and leak beneath the retina.",
    symptoms: ["No symptoms in early AMD", "Blurred central vision", "Straight lines appearing wavy", "Blank or dark areas in central vision", "Reduced color brightness or difficulty in low light"],
    riskFactors: ["Age 55 or older", "Family history of AMD", "Smoking", "High blood pressure or cardiovascular risk", "Certain genetic and ancestry-related factors"],
    examination: ["Comprehensive dilated eye examination", "OCT imaging", "Retinal photography", "Amsler grid and angiography when appropriate"],
    generalTreatment: ["Early AMD is usually monitored", "Specific AREDS2 supplements may help some people with intermediate or late AMD after professional assessment", "Wet AMD is commonly treated with anti-VEGF injections", "Vision rehabilitation can support people with lasting vision loss"],
    whenToSeekCare: "Contact an eye-care professional promptly if straight lines appear wavy or a new blurred, dark, or missing area develops in central vision."
  },
  {
    id: "pathologic-myopia",
    name: "Pathologic Myopia",
    shortName: "Pathologic Myopia",
    examinationType: "Fundus",
    shortDescription: "Progressive structural changes at the back of a highly myopic eye that may threaten central or peripheral vision.",
    overview: "Pathologic myopia, also called myopic degeneration, involves stretching and thinning of tissues at the back of a highly nearsighted eye. It can lead to retinal atrophy, cracks, abnormal blood vessels, retinal splitting, holes, or detachment.",
    symptoms: ["Blurred distance vision related to myopia", "New distortion or a central blurred spot", "A dark or missing area in vision", "Flashes, floaters, or a curtain-like shadow if the retina tears or detaches"],
    riskFactors: ["High or progressive myopia", "A longer-than-average eyeball", "Family history or genetic tendency", "Long-standing structural changes from severe nearsightedness"],
    examination: ["Refraction and visual acuity testing", "Dilated examination of the central and peripheral retina", "OCT of the macula", "Retinal photography or angiography for suspected complications"],
    generalTreatment: ["Glasses or contact lenses correct the refractive error but do not reverse retinal changes", "Regular monitoring helps identify complications", "Anti-VEGF injections may be used for myopic CNV", "Retinal tears, detachment, or traction-related problems may require laser or surgery"],
    whenToSeekCare: "Seek urgent care for sudden flashes, many new floaters, a curtain-like shadow, sudden loss of vision, or rapid new central distortion."
  }
];
